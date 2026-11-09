pub mod consts;
pub mod env;
pub mod functions;

use oxc_ast::ast::{Argument, ObjectExpression, ObjectPropertyKind, PropertyKind, TemplateLiteral};

pub use env::{Env, Layer, Lookup, NOTHING, Single};

use crate::engine::hash::hash_object;
use crate::engine::specificity::{
    InvalidSelector, MAX_SELECTOR_NESTING, find_invalid_selector, strip_selector_comments,
};
use crate::js::number::{number_to_string, to_int32, to_uint32};
use crate::js::{Object, Value};
use crate::style::theme::theme_var_reference;
use crate::oxc::syntax::expr::{
    BinOp, BinaryOp, Call, E, K, Key, Prop, UnaryOp, argument_expression, expression_label, member_prop,
    root_identifier, str_value, unwrap,
};

pub type EvalResult<T> = Result<T, String>;

pub type ResolveVariable<'r> = &'r dyn Fn(&str) -> Option<Value>;

pub type Replacements = rustc_hash::FxHashMap<(u32, u32), Value>;

pub trait Imports {
    fn name(&self, local: &str) -> Option<Value>;
    fn member(&self, local: &str, key: &str) -> Option<Value>;
    fn nested(&self, _local: &str, _first: &str, _second: &str) -> Option<Value> {
        None
    }
    fn key_used(&self, _token: &str, _label: &str) {}
}

pub fn argument_expr<'b>(argument: &'b Argument<'b>) -> E<'b> {
    E::new(argument_expression(argument))
}

pub fn span_key(e: E) -> (u32, u32) {
    let span = e.span();
    (span.start, span.end)
}

#[derive(Clone, Copy)]
pub struct Evaluator<'e, 'r> {
    pub env: Env<'e>,
    pub resolve_variable: Option<ResolveVariable<'r>>,
    pub replacements: Option<&'r Replacements>,
    pub imports: Option<&'r dyn Imports>,
}

impl<'e, 'r> Evaluator<'e, 'r> {
    pub fn new(env: Env<'e>) -> Self {
        Evaluator {
            env,
            resolve_variable: None,
            replacements: None,
            imports: None,
        }
    }

    pub fn with_resolver(env: Env<'e>, resolve_variable: ResolveVariable<'r>) -> Self {
        Evaluator {
            resolve_variable: Some(resolve_variable),
            ..Evaluator::new(env)
        }
    }

    pub fn with_replacements(env: Env<'e>, replacements: &'r Replacements) -> Self {
        Evaluator {
            replacements: Some(replacements),
            ..Evaluator::new(env)
        }
    }

    pub fn importing(self, imports: &'r dyn Imports) -> Self {
        Evaluator {
            imports: Some(imports),
            ..self
        }
    }

    fn plain(&self) -> Evaluator<'e, 'r> {
        Evaluator {
            resolve_variable: None,
            ..*self
        }
    }

    pub fn plain_property_into(&self, prop: &ObjectPropertyKind, obj: &mut Object) -> EvalResult<()> {
        self.plain().property_into(prop, obj)
    }

    pub fn plain_property_value(&self, value: E) -> EvalResult<Option<Value>> {
        self.plain().property_value(value)
    }

    pub fn object(&self, node: &ObjectExpression) -> EvalResult<Object> {
        self.properties(node.properties.iter())
    }

    pub fn properties<'b>(
        &self,
        properties: impl Iterator<Item = &'b ObjectPropertyKind<'b>>,
    ) -> EvalResult<Object> {
        let mut obj = Object::new();
        for prop in properties {
            self.property_into(prop, &mut obj)?;
        }
        Ok(obj)
    }

    pub fn property_into(&self, prop: &ObjectPropertyKind, obj: &mut Object) -> EvalResult<()> {
        let prop = match prop {
            ObjectPropertyKind::SpreadProperty(spread) => {
                let argument = E::new(&spread.argument);
                match self.plain().expression(argument)? {
                    Value::Obj(spread_obj) => {
                        for (key, value) in spread_obj.iter() {
                            insert_keeping_markers(obj, key.to_string(), value.clone());
                        }
                    }
                    Value::Null if !matches!(unwrap(argument).kind(), K::Null) => {
                        return Err(format!(
                            "[typedcss] Cannot spread {} at build time. Spread a const object, or pass a runtime value through the function form, css.create({{ name: (value) => ({{ ... }}) }}).",
                            expression_label(argument)
                        ));
                    }
                    _ => {}
                }
                return Ok(());
            }
            ObjectPropertyKind::ObjectProperty(prop) => &**prop,
        };
        if prop.kind != PropertyKind::Init || prop.method {
            return Err(format!(
                "[typedcss] Cannot read the method or accessor \"{}\" at build time. Write it as a plain property.",
                Key::of(prop).name().unwrap_or_default()
            ));
        }
        match &prop.value {
            oxc_ast::ast::Expression::Identifier(ident) if prop.shorthand => {
                let key = ident.name.as_str();
                if let Some(resolve) = self.resolve_variable
                    && let Some(resolved) = resolve(key)
                {
                    obj.insert(key, resolved);
                    return Ok(());
                }
                if let Some(value) = self.property_value(E::ident(ident))? {
                    obj.insert(key, value);
                }
                Ok(())
            }
            _ if prop.shorthand => Ok(()),
            _ => {
                let key = self.property_key(Key::of(prop))?;
                if !key.truthy() {
                    return Ok(());
                }
                let key = key.to_js_string();
                let key = if key.contains("/*") {
                    strip_selector_comments(&key).into_owned()
                } else {
                    key
                };
                let key = match crate::oxc::link::at_rule_token(&key) {
                    Some(at_rule) if matches!(unwrap(E::new(&prop.value)).kind(), K::Object(_)) => {
                        at_rule
                    }
                    _ => key,
                };
                if key.starts_with(':') || key.starts_with('[') {
                    match find_invalid_selector(&key) {
                        Some(InvalidSelector::SameName(name)) => {
                            return Err(format!(
                                "[typedcss] \"{name}()\" cannot be nested inside another \"{name}()\": \"{key}\". Rewrite the selector without nesting."
                            ));
                        }
                        Some(InvalidSelector::TooDeep) => {
                            return Err(format!(
                                "[typedcss] Selector nests deeper than {MAX_SELECTOR_NESTING} levels: \"{key}\". Rewrite the selector with fewer levels."
                            ));
                        }
                        Some(InvalidSelector::StrayQuote) => {
                            return Err(format!(
                                "[typedcss] Unexpected quote in selector: \"{key}\". Close the string inside brackets or parentheses, or remove the quote."
                            ));
                        }
                        None => {}
                    }
                }
                if let Some(value) = self.property_value(E::new(&prop.value))? {
                    insert_keeping_markers(obj, key, value);
                }
                Ok(())
            }
        }
    }

    pub fn property_value(&self, value: E) -> EvalResult<Option<Value>> {
        let val = unwrap(value);
        let statics = self.env.statics;
        if let K::Ident(_) | K::Member(_) = val.kind() {
            if let (Some(resolve), true) = (self.resolve_variable, val.is_member())
                && let Some(root) = root_identifier(val)
                && let Some(resolved) = resolve(root)
            {
                let layered = Single {
                    key: root,
                    value: resolved,
                    parent: statics,
                };
                return match resolve_static_member(val, &layered) {
                    Some(member) => Ok(Some(member)),
                    None => Err(format!(
                        "[typedcss] Unknown style member: {} does not exist.",
                        expression_label(val)
                    )),
                };
            }
            if let Some(hash) = self.keyframes_member(val) {
                return Ok(Some(Value::Str(format!("kf-{hash}"))));
            }
            if let Some(hash) = self.view_transition_member(val) {
                return Ok(Some(Value::Str(format!("vt-{hash}"))));
            }
            if let Some(hash) = self.position_try_member(val) {
                return Ok(Some(Value::Str(format!("--pt-{hash}"))));
            }
            if let Some(hash) = self.var_type_member(val) {
                return Ok(Some(Value::Str(format!("--pr-{hash}"))));
            }
            if let Some(name) = val.ident_name()
                && let Some(hash) = self.env.create_hashes.lookup(name)
            {
                return Ok(Some(Value::Str(format!("cr-{hash}"))));
            }
            if let Some(theme) = self.theme_member(val) {
                return Ok(Some(theme));
            }
            if let Some(value) = self.static_object_member(val) {
                return Ok(Some(value));
            }
            if let Some(value) = self.imported(val) {
                return Ok(Some(value));
            }
        }

        match val.kind() {
            K::Str(value) => Ok(Some(Value::Str(str_value(value)))),
            K::Num(value) => Ok(Some(Value::Num(value.value))),
            K::Bool(value) => Ok(Some(Value::Bool(value))),
            K::Unary(_) => self.plain().expression(val).map(Some),
            K::Object(object) => Ok(Some(Value::obj(self.object(object)?))),
            K::Binary(..) | K::Template(_) => self.plain().expression(val).map(Some),
            K::Member(_) => Ok(resolve_static_member(val, statics)),
            K::Ident(ident) => {
                if let Some(resolve) = self.resolve_variable
                    && let Some(resolved) = resolve(ident.name.as_str())
                {
                    return Ok(Some(resolved));
                }
                Ok(statics.lookup(ident.name.as_str()))
            }
            _ => Ok(None),
        }
    }

    fn note_key(&self, text: &str, expr: E) {
        if let Some(imports) = self.imports
            && text.starts_with(crate::oxc::link::VALUE_PREFIX)
        {
            imports.key_used(text, &expression_label(expr));
        }
    }

    pub fn property_key(&self, key: Key) -> EvalResult<Value> {
        let expr = match key {
            Key::Ident(name) => return Ok(Value::str(name)),
            Key::Str(value) => return Ok(Value::Str(str_value(value))),
            Key::Num(value) => {
                let text = number_to_string(value);
                return Err(format!(
                    "[typedcss] The style key {text} is a number. Style keys have to be names — quote it as '{text}' or rename it."
                ));
            }
            Key::Computed(computed) => E::new(computed),
            Key::Other => return Ok(Value::str("")),
        };
        match expr.kind() {
            K::Str(value) => return Ok(Value::Str(str_value(value))),
            K::Ident(ident) => {
                if let Some(Value::Str(text)) = self.env.statics.lookup(ident.name.as_str())
                    && !text.is_empty()
                {
                    return Ok(Value::Str(text));
                }
                if let Some(hash) = self.env.var_types.lookup(ident.name.as_str()) {
                    return Ok(Value::Str(format!("--pr-{hash}")));
                }
                if let Some(Value::Str(text)) = self.imported(expr) {
                    self.note_key(&text, expr);
                    return Ok(Value::Str(text));
                }
            }
            _ => {}
        }
        if let K::Call(_) = expr.kind()
            && let Value::Str(text) = self.plain().expression(expr)?
        {
            return Ok(Value::Str(text));
        }
        if let K::Member(_) = expr.kind() {
            if let Some(Value::Str(text)) = resolve_static_member(expr, self.env.statics) {
                return Ok(Value::Str(text));
            }
            if let Some(Value::Str(text)) = self.static_object_member(expr) {
                return Ok(Value::Str(text));
            }
            if let Some(Value::Str(text)) = self.theme_member(expr) {
                return Ok(Value::Str(text));
            }
            if let Some(Value::Str(text)) = self.imported(expr) {
                self.note_key(&text, expr);
                return Ok(Value::Str(text));
            }
        }
        match expr.kind() {
            K::Template(template) => self.plain().template(template).map(Value::Str),
            K::Binary(left, op, right) => self.plain().binary(left, op, right),
            _ => Err(format!(
                "[typedcss] Cannot inline the computed key [{}] at build time. Declare it with css.createStatic, such as const breakpoints = css.createStatic({{ sm: '...' }}), and read it as [breakpoints.sm]. A definition in a package needs to be compiled with the app.",
                expression_label(expr)
            )),
        }
    }

    pub fn template(&self, node: &TemplateLiteral) -> EvalResult<String> {
        let mut result = String::new();
        for (index, quasi) in node.quasis.iter().enumerate() {
            match quasi.value.cooked {
                Some(cooked) if !cooked.as_bytes().is_empty() => result.push_str(&cooked.display().to_string()),
                _ => result.push_str(quasi.value.raw.as_str()),
            }
            if let Some(expr) = node.expressions.get(index) {
                let value = self.expression(E::new(expr))?;
                if matches!(value, Value::Null | Value::Obj(_)) {
                    return Err(format!(
                        "[typedcss] Template value cannot be resolved to a primitive: {} inside ${{}} must resolve to a string or number at build time.",
                        expression_label(E::new(expr))
                    ));
                }
                result.push_str(&value.to_js_string());
            }
        }
        Ok(result)
    }

    pub fn binary(&self, left: E, op: BinOp, right: E) -> EvalResult<Value> {
        let left_value = self.expression(left)?;
        let operator = op.0;
        match operator {
            BinaryOp::LogicalAnd if !left_value.truthy() => return Ok(left_value),
            BinaryOp::LogicalOr if left_value.truthy() => return Ok(left_value),
            BinaryOp::NullishCoalescing if left_value != Value::Null => return Ok(left_value),
            _ => {}
        }
        let right_value = self.expression(right)?;
        if op.is_logical() {
            return Ok(right_value);
        }
        if let (Value::Num(l), Value::Num(r)) = (&left_value, &right_value) {
            let (l, r) = (*l, *r);
            let result = match operator {
                BinaryOp::Add => Some(l + r),
                BinaryOp::Sub => Some(l - r),
                BinaryOp::Mul => Some(l * r),
                BinaryOp::Div => Some(l / r),
                BinaryOp::Mod => Some(l % r),
                BinaryOp::Exp => Some(js_pow(l, r)),
                BinaryOp::BitAnd => Some((to_int32(l) & to_int32(r)) as f64),
                BinaryOp::LShift => Some(to_int32(l).wrapping_shl(to_uint32(r) & 31) as f64),
                BinaryOp::RShift => Some(to_int32(l).wrapping_shr(to_uint32(r) & 31) as f64),
                BinaryOp::ZeroFillRShift => {
                    Some(to_uint32(l).wrapping_shr(to_uint32(r) & 31) as f64)
                }
                BinaryOp::BitXor => Some((to_int32(l) ^ to_int32(r)) as f64),
                BinaryOp::BitOr => Some((to_int32(l) | to_int32(r)) as f64),
                _ => None,
            };
            if let Some(result) = result {
                return Ok(Value::Num(result));
            }
        }
        if operator == BinaryOp::Add
            && !matches!(left_value, Value::Null | Value::Obj(_))
            && !matches!(right_value, Value::Null | Value::Obj(_))
        {
            return Ok(Value::Str(format!(
                "{}{}",
                left_value.to_js_string(),
                right_value.to_js_string()
            )));
        }
        let arithmetic = matches!(
            operator,
            BinaryOp::Add
                | BinaryOp::Sub
                | BinaryOp::Mul
                | BinaryOp::Div
                | BinaryOp::Mod
                | BinaryOp::Exp
                | BinaryOp::BitAnd
                | BinaryOp::LShift
                | BinaryOp::RShift
                | BinaryOp::ZeroFillRShift
                | BinaryOp::BitXor
                | BinaryOp::BitOr
        );
        if arithmetic {
            let expected = if operator == BinaryOp::Add {
                "non-null primitive"
            } else {
                "numeric"
            };
            let type_of = |value: &Value| {
                if *value == Value::Null {
                    "null"
                } else {
                    value.type_of()
                }
            };
            return Err(format!(
                "[typedcss] Binary operator {} requires {expected} operands; received {} and {}.",
                operator.as_str(),
                type_of(&left_value),
                type_of(&right_value)
            ));
        }
        Err(format!(
            "[typedcss] Unsupported binary operator: {}. Use arithmetic, bitwise, &&, ||, or ?? operators, which can be resolved at build time.",
            operator.as_str()
        ))
    }

    fn call(&self, call: Call) -> EvalResult<Value> {
        let Some(callee) = call.callee else {
            return Ok(Value::Null);
        };
        let callee = E::new(callee);
        let method = match callee.kind() {
            K::Ident(ident) => Some(ident.name.as_str()),
            K::Member(_) => match callee.prop() {
                Some(Prop::Name(name)) => Some(name),
                _ => None,
            },
            _ => None,
        };
        let Some(method) = method else {
            return Ok(Value::Null);
        };
        if (method == "marker" || method == "extended") && call.args.len() >= 2 {
            let statics_only = Evaluator::new(Env::statics_only(self.env.statics));
            let id = statics_only.expression(argument_expr(&call.args[0]))?;
            let pseudo = statics_only.expression(argument_expr(&call.args[1]))?;
            if let (Value::Str(id), Value::Str(pseudo)) = (&id, &pseudo) {
                let var_name = marker_var(id, pseudo);
                if method == "marker" {
                    let mut inner = Object::new();
                    inner.insert(var_name, Value::Num(1.0));
                    let mut outer = Object::new();
                    outer.insert(pseudo.clone(), Value::obj(inner));
                    return Ok(Value::obj(outer));
                }
                return Ok(Value::Str(format!("@container style({var_name}: 1)")));
            }
        }
        Ok(Value::Null)
    }

    pub fn expression(&self, node: E) -> EvalResult<Value> {
        let node = unwrap(node);
        if let Some(replacements) = self.replacements
            && let Some(value) = replacements.get(&span_key(node))
        {
            return Ok(value.clone());
        }
        match node.kind() {
            K::Call(call) => self.call(call),
            K::Str(value) => Ok(Value::Str(str_value(value))),
            K::Num(value) => Ok(Value::Num(value.value)),
            K::Bool(value) => Ok(Value::Bool(value)),
            K::Null => Ok(Value::Null),
            K::Ident(ident) => {
                let name = ident.name.as_str();
                if let Some(value) = self.env.statics.lookup(name) {
                    return Ok(value);
                }
                if let Some(hash) = self.env.keyframes.lookup(name) {
                    return Ok(Value::Str(format!("kf-{hash}")));
                }
                if let Some(hash) = self.env.view_transitions.lookup(name) {
                    return Ok(Value::Str(format!("vt-{hash}")));
                }
                if let Some(hash) = self.env.position_tries.lookup(name) {
                    return Ok(Value::Str(format!("--pt-{hash}")));
                }
                if let Some(hash) = self.env.var_types.lookup(name) {
                    return Ok(Value::Str(format!("--pr-{hash}")));
                }
                if let Some(hash) = self.env.static_hashes.lookup(name)
                    && let Some(object) = self.env.static_objects.lookup(&hash)
                {
                    return Ok(object);
                }
                if let Some(value) = self.imported(node) {
                    return Ok(value);
                }
                Err(format!(
                    "[typedcss] Cannot resolve static value: {name}. It must be a const holding a string or number, declared in this file or imported from a module plumeria can read."
                ))
            }
            K::Member(_) => {
                if let Some(value) = resolve_static_member(node, self.env.statics) {
                    return Ok(value);
                }
                if let Some(value) = self.theme_member(node) {
                    return Ok(value);
                }
                if let Some(value) = self.static_object_member(node) {
                    return Ok(value);
                }
                if let Some(value) = self.imported(node) {
                    return Ok(value);
                }
                Err(format!(
                    "[typedcss] Cannot resolve static member expression: {}. Its object must be a const or a value created by css.createStatic or css.createTheme.",
                    expression_label(node)
                ))
            }
            K::Binary(left, op, right) => self.binary(left, op, right),
            K::Template(template) => self.template(template).map(Value::Str),
            K::Unary(unary) => {
                let value = self.expression(E::new(unary.arg))?;
                if unary.op == UnaryOp::Bang {
                    return Ok(Value::Bool(!value.truthy()));
                }
                if let Value::Num(number) = value {
                    match unary.op {
                        UnaryOp::Minus => return Ok(Value::Num(-number)),
                        UnaryOp::Plus => return Ok(Value::Num(number)),
                        UnaryOp::Tilde => return Ok(Value::Num(!to_int32(number) as f64)),
                        _ => {}
                    }
                }
                Err(format!(
                    "[typedcss] Unsupported unary operand for {}: {} must resolve to a number at build time.",
                    unary.op.as_str(),
                    expression_label(E::new(unary.arg))
                ))
            }
            K::Paren(inner) => self.expression(E::new(inner)),
            _ => Err(format!(
                "[typedcss] Unsupported expression type: {}. Style values must be literals, consts, or arithmetic and template expressions of them.",
                expression_label(node)
            )),
        }
    }

    fn imported(&self, node: E) -> Option<Value> {
        let imports = self.imports?;
        match node.kind() {
            K::Ident(ident) => imports.name(ident.name.as_str()),
            K::Member(_) => {
                let object = unwrap(node.object()?);
                let key = member_key(node, Some(self.env.statics))?;
                if let Some(local) = object.ident_name() {
                    return imports.member(local, &key);
                }
                if object.is_member()
                    && let Some(root) = object.object().and_then(|root| unwrap(root).ident_name())
                    && let Some(first) = member_key(object, Some(self.env.statics))
                    && let Some(value) = imports.nested(root, &first, &key)
                {
                    return Some(value);
                }
                self.imported(object)?.as_obj()?.get(&key).cloned()
            }
            _ => None,
        }
    }

    fn keyframes_member(&self, node: E) -> Option<String> {
        match node.kind() {
            K::Ident(ident) => self.env.keyframes.lookup(ident.name.as_str()),
            K::Member(_) => node
                .object()?
                .ident_name()
                .and_then(|name| self.env.keyframes.lookup(name)),
            _ => None,
        }
    }

    fn position_try_member(&self, node: E) -> Option<String> {
        self.env.position_tries.lookup(node.ident_name()?)
    }

    fn var_type_member(&self, node: E) -> Option<String> {
        self.env.var_types.lookup(node.ident_name()?)
    }

    fn view_transition_member(&self, node: E) -> Option<String> {
        match node.kind() {
            K::Ident(ident) => self.env.view_transitions.lookup(ident.name.as_str()),
            K::Member(_) => node
                .object()?
                .ident_name()
                .and_then(|name| self.env.view_transitions.lookup(name)),
            _ => None,
        }
    }

    pub fn theme_member(&self, node: E) -> Option<Value> {
        let object_name = node.object()?.ident_name()?;
        let hash = self.env.theme_hashes.lookup(object_name)?;
        if hash.is_empty() {
            return None;
        }
        let theme = self.env.theme_objects.lookup(&hash)?;
        let theme = theme.as_obj()?;
        let key = member_key(node, Some(self.env.statics))?;
        let value = theme.get(&key)?;
        Some(Value::Str(theme_var_reference(&hash, &key, value)))
    }

    pub fn static_object_member(&self, node: E) -> Option<Value> {
        let object_name = node.object()?.ident_name()?;
        let hash = self.env.static_hashes.lookup(object_name)?;
        if hash.is_empty() {
            return None;
        }
        let object = self.env.static_objects.lookup(&hash)?;
        let object = object.as_obj()?;
        let key = member_key(node, Some(self.env.statics))?;
        object.get(&key).cloned()
    }
}

fn member_key(node: E, statics: Option<&dyn Lookup<Value>>) -> Option<String> {
    match node.prop()? {
        Prop::Name(name) => Some(name.to_string()),
        Prop::Computed(expr) => {
            let inner = unwrap(expr);
            match inner.kind() {
                K::Str(value) => Some(str_value(value)),
                K::Num(value) => Some(number_to_string(value.value)),
                K::Ident(ident) => match statics?.lookup(ident.name.as_str()) {
                    Some(Value::Str(text)) => Some(text),
                    Some(Value::Num(number)) => Some(number_to_string(number)),
                    _ => None,
                },
                _ => None,
            }
        }
        Prop::Private => None,
    }
}

fn js_pow(base: f64, exponent: f64) -> f64 {
    if exponent.is_nan() || ((base == 1.0 || base == -1.0) && exponent.is_infinite()) {
        return f64::NAN;
    }
    base.powf(exponent)
}

pub fn resolve_static_member(node: E, statics: &dyn Lookup<Value>) -> Option<Value> {
    let mut keys: Vec<String> = Vec::new();
    let mut current = node;
    while let K::Member(member) = current.kind() {
        let key = match member_prop(member) {
            Prop::Name(name) => Some(name.to_string()),
            Prop::Computed(expr) => {
                let inner = unwrap(expr);
                match inner.kind() {
                    K::Str(value) => Some(str_value(value)),
                    K::Num(value) => Some(number_to_string(value.value)),
                    K::Ident(ident) => match statics.lookup(ident.name.as_str()) {
                        Some(Value::Str(text)) => Some(text),
                        Some(Value::Num(number)) => Some(number_to_string(number)),
                        _ => None,
                    },
                    _ => None,
                }
            }
            Prop::Private => None,
        };
        keys.push(key?);
        current = unwrap(current.member_object(member));
    }
    let root = current.ident_name()?;
    let mut value = statics.lookup(root)?;
    for key in keys.iter().rev() {
        let next = match &value {
            Value::Obj(object) => object.get(key).cloned(),
            _ => None,
        };
        value = next?;
    }
    Some(value)
}

pub fn resolve_theme_selector(node: E, env: Env) -> String {
    let limited = Env {
        statics: env.statics,
        keyframes: &NOTHING,
        view_transitions: &NOTHING,
        position_tries: &NOTHING,
        var_types: &NOTHING,
        theme_hashes: &NOTHING,
        theme_objects: &NOTHING,
        create_hashes: &NOTHING,
        static_hashes: env.static_hashes,
        static_objects: env.static_objects,
    };
    match Evaluator::new(limited).expression(node) {
        Ok(Value::Str(text)) => text,
        _ => String::new(),
    }
}

fn to_ident(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect()
}

pub fn marker_var(id: &str, pseudo: &str) -> String {
    let mut source = Object::new();
    source.insert(id, Value::str(pseudo));
    let hash = hash_object(&source);
    let head = pseudo.split('(').next().unwrap_or("");
    format!("--{hash}-{}-{}", to_ident(id), to_ident(head))
}

fn is_marker_entry(name: &str, value: &Value, pseudo: &str) -> bool {
    if *value != Value::Num(1.0) {
        return false;
    }
    let Some((_, rest)) = name
        .strip_prefix("--")
        .and_then(|rest| rest.split_once('-'))
    else {
        return false;
    };
    let head = to_ident(pseudo.split('(').next().unwrap_or(""));
    let Some(id) = rest
        .strip_suffix(head.as_str())
        .and_then(|rest| rest.strip_suffix('-'))
    else {
        return false;
    };
    marker_var(id, pseudo) == name
}

fn insert_keeping_markers(obj: &mut Object, key: String, value: Value) {
    let merged = match (obj.get(&key), &value) {
        (Some(Value::Obj(existing)), Value::Obj(incoming)) if key.starts_with(':') => {
            let only_markers = !incoming.is_empty()
                && incoming
                    .iter()
                    .all(|(name, value)| is_marker_entry(name, value, &key));
            let mut merged = Object::new();
            for (name, value) in existing.iter() {
                if !incoming.contains_key(name)
                    && (only_markers || is_marker_entry(name, value, &key))
                {
                    merged.insert(name, value.clone());
                }
            }
            if merged.is_empty() {
                None
            } else {
                merged.assign(incoming);
                Some(Value::obj(merged))
            }
        }
        _ => None,
    };
    obj.insert(key, merged.unwrap_or(value));
}
