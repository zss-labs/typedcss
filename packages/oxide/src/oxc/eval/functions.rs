use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashSet};
use oxc_ast::ast::{
    ArrowFunctionBody, BindingPattern, Expression, FormalParameter, FormalParameters, ObjectExpression, Statement,
};

use super::{Env, EvalResult, Evaluator, Layer, Lookup, Replacements, span_key};
use crate::engine::hash::hash_object;
use crate::js::{Object, Value};
use crate::style::units::{VarGroup, VarUnit, apply_var_fallback, split_var_by_unit};
use crate::oxc::syntax::expr::{BinaryOp, E, K, Key, UnaryOp, as_key_value, expression_label, property_key, unwrap};
use crate::oxc::syntax::visit::{reads_names_expr, reads_names_property};

#[derive(Clone, Debug)]
pub struct NamedParam {
    pub key: String,
    pub local: String,
}

#[derive(Clone)]
pub struct StyleFunction<'b> {
    pub params: Vec<String>,
    pub unsupported_params: bool,
    pub named: Option<Vec<NamedParam>>,
    pub defaults: IndexMap<String, &'b Expression<'b>, FxBuildHasher>,
    pub body: &'b ObjectExpression<'b>,
}

pub type StyleFunctions<'b> = IndexMap<String, StyleFunction<'b>, FxBuildHasher>;

#[derive(Clone, Copy)]
pub struct ParamView<'b> {
    pub pattern: &'b BindingPattern<'b>,
    pub initializer: Option<&'b Expression<'b>>,
    pub rest: bool,
}

fn pattern_view<'b>(pattern: &'b BindingPattern<'b>, rest: bool) -> ParamView<'b> {
    match pattern {
        BindingPattern::AssignmentPattern(assign) if !rest => ParamView {
            pattern: &assign.left,
            initializer: Some(&assign.right),
            rest,
        },
        other => ParamView {
            pattern: other,
            initializer: None,
            rest,
        },
    }
}

pub fn param_view<'b>(param: &'b FormalParameter<'b>) -> ParamView<'b> {
    match &param.initializer {
        Some(initializer) => ParamView {
            pattern: &param.pattern,
            initializer: Some(initializer),
            rest: false,
        },
        None => pattern_view(&param.pattern, false),
    }
}

/// Each parameter as it is written, the rest parameter last.
pub fn param_views<'b>(params: &'b FormalParameters<'b>) -> Vec<ParamView<'b>> {
    params
        .items
        .iter()
        .map(param_view)
        .chain(params.rest.iter().map(|rest| pattern_view(&rest.rest.argument, true)))
        .collect()
}

fn named_params_of<'b>(
    params: &[ParamView<'b>],
    defaults: &mut IndexMap<String, &'b Expression<'b>, FxBuildHasher>,
) -> Option<Vec<NamedParam>> {
    if params.len() != 1 {
        return None;
    }
    let first = &params[0];
    if first.rest || first.initializer.is_some() {
        return None;
    }
    let BindingPattern::ObjectPattern(pattern) = first.pattern else {
        return None;
    };
    if pattern.rest.is_some() {
        return None;
    }
    let mut named = Vec::new();
    for prop in &pattern.properties {
        let key = match property_key(&prop.key, prop.computed) {
            Key::Ident(key) => key.to_string(),
            _ => return None,
        };
        let (local, default) = match &prop.value {
            BindingPattern::BindingIdentifier(local) => (local.name.to_string(), None),
            BindingPattern::AssignmentPattern(assign) => {
                let BindingPattern::BindingIdentifier(local) = &assign.left else {
                    return None;
                };
                (local.name.to_string(), Some(&assign.right))
            }
            _ => return None,
        };
        if let Some(value) = default {
            defaults.insert(local.clone(), value);
        }
        named.push(NamedParam { key, local });
    }
    if named.is_empty() { None } else { Some(named) }
}

#[derive(Clone, Copy)]
pub enum Body<'b> {
    Block(&'b [Statement<'b>]),
    Expr(&'b Expression<'b>),
}

pub fn function_parts<'b>(value: &'b Expression<'b>) -> Option<(Vec<ParamView<'b>>, Body<'b>)> {
    match value {
        Expression::ArrowFunctionExpression(arrow) => Some((
            param_views(&arrow.params),
            match &arrow.body {
                ArrowFunctionBody::FunctionBody(block) => Body::Block(&block.statements),
                expr => Body::Expr(expr.to_expression()),
            },
        )),
        Expression::FunctionExpression(function) => function
            .body
            .as_ref()
            .map(|body| (param_views(&function.params), Body::Block(&body.statements))),
        _ => None,
    }
}

pub fn returned_expression(body: Body<'_>) -> Option<&Expression<'_>> {
    match body {
        Body::Expr(expr) => Some(expr),
        Body::Block(stmts) => match stmts.first()? {
            Statement::ReturnStatement(statement) => statement.argument.as_ref(),
            _ => None,
        },
    }
}

fn strip_one_paren<'b>(expr: &'b Expression<'b>) -> &'b Expression<'b> {
    match expr {
        Expression::ParenthesizedExpression(paren) => &paren.expression,
        other => other,
    }
}

pub fn style_function_body<'b>(value: &'b Expression<'b>) -> Option<&'b ObjectExpression<'b>> {
    let (_, body) = function_parts(value)?;
    match strip_one_paren(returned_expression(body)?) {
        Expression::ObjectExpression(object) => Some(object),
        _ => None,
    }
}

pub fn style_functions_of<'b>(object: &'b ObjectExpression<'b>) -> StyleFunctions<'b> {
    let mut functions = StyleFunctions::default();
    for prop in &object.properties {
        let Some(prop) = as_key_value(prop) else {
            continue;
        };
        let Key::Ident(key) = Key::of(prop) else {
            continue;
        };
        let Some((views, _)) = function_parts(&prop.value) else {
            continue;
        };

        let mut defaults: IndexMap<String, &Expression, FxBuildHasher> = IndexMap::default();
        let names: Vec<String> = views
            .iter()
            .map(|view| {
                if view.rest {
                    return "arg".to_string();
                }
                match (view.pattern, view.initializer) {
                    (BindingPattern::BindingIdentifier(ident), None) => ident.name.to_string(),
                    (BindingPattern::BindingIdentifier(ident), Some(right)) => {
                        defaults.insert(ident.name.to_string(), right);
                        ident.name.to_string()
                    }
                    _ => "arg".to_string(),
                }
            })
            .collect();

        let Some(body) = style_function_body(&prop.value) else {
            continue;
        };

        let unsupported = views.iter().any(|view| {
            if view.rest {
                return true;
            }
            if view.initializer.is_some() {
                return false;
            }
            match view.pattern {
                BindingPattern::ArrayPattern(_) => true,
                BindingPattern::ObjectPattern(_) => {
                    let mut scratch = IndexMap::default();
                    named_params_of(&views, &mut scratch).is_none()
                }
                _ => false,
            }
        });
        let named = named_params_of(&views, &mut defaults);

        functions.insert(
            key.to_string(),
            StyleFunction {
                params: names,
                unsupported_params: unsupported,
                named,
                defaults,
                body,
            },
        );
    }
    functions
}

#[derive(Clone, Debug, PartialEq)]
pub enum Literal {
    Str(String),
    Num(f64),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Derived {
    Param(String, Option<Literal>),
    Literal(Literal),
    Binary(Box<Derived>, BinaryOp, Box<Derived>),
    Unary(UnaryOp, Box<Derived>),
}

impl Derived {
    pub fn first_param(&self) -> Option<&str> {
        match self {
            Derived::Param(name, _) => Some(name),
            Derived::Literal(_) => None,
            Derived::Binary(left, _, right) => left.first_param().or_else(|| right.first_param()),
            Derived::Unary(_, argument) => argument.first_param(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct DerivedVar {
    pub name: String,
    pub expr: Derived,
}

enum Replacement {
    Constant(f64),
    Derived(String),
}

fn default_error(param: &str, node: E, literal: Option<&Value>) -> String {
    let kind = match (node.kind(), literal) {
        (K::Null, _) | (_, Some(Value::Null)) => Some("null"),
        (_, Some(Value::Bool(_))) => Some("a boolean"),
        (_, Some(_)) => Some("an object"),
        _ => None,
    };
    match kind {
        Some(kind) => format!(
            "[typedcss] The default of \"{param}\" is {kind}, which a dynamic style function cannot fall back on. Use a string or a number, or pass the value from the call."
        ),
        None => format!(
            "[typedcss] Cannot resolve the default of \"{param}\" at build time ({}). A dynamic style function falls back on it when the argument is undefined, so it has to be a string or a number plumeria can read. Pass the value from the call instead.",
            expression_label(node)
        ),
    }
}

pub fn literal_value(value: &Value) -> Option<Literal> {
    match value {
        Value::Str(text) => Some(Literal::Str(text.to_string())),
        Value::Num(number) => Some(Literal::Num(*number)),
        _ => None,
    }
}

struct Deriver<'d> {
    runtime: &'d [String],
    vars: &'d [String],
    defaults: &'d IndexMap<String, Value, FxBuildHasher>,
    evaluate: &'d dyn Fn(E) -> Option<Value>,
    derived: Vec<DerivedVar>,
    replacements: Vec<((u32, u32), Replacement)>,
}

fn is_arithmetic(operator: BinaryOp) -> bool {
    matches!(
        operator,
        BinaryOp::Add | BinaryOp::Sub | BinaryOp::Mul | BinaryOp::Div | BinaryOp::Mod | BinaryOp::Exp
    )
}

fn is_sign(operator: UnaryOp) -> bool {
    matches!(operator, UnaryOp::Minus | UnaryOp::Plus)
}

fn reads(node: E, names: &[String]) -> bool {
    node.expr()
        .is_some_and(|expr| reads_names_expr(expr, &|name| names.iter().any(|param| param == name)))
}

impl Deriver<'_> {
    fn render(&self, expression: E) -> Option<Derived> {
        let node = unwrap(expression);
        match node.kind() {
            K::Ident(ident) if self.runtime.iter().any(|param| param == ident.name.as_str()) => {
                let name = ident.name.as_str();
                let fallback = self.defaults.get(name).and_then(literal_value);
                return Some(Derived::Param(name.to_string(), fallback));
            }
            K::Binary(left, op, right) if is_arithmetic(op.0) => {
                let left = self.render(left)?;
                let right = self.render(right)?;
                return Some(Derived::Binary(Box::new(left), op.0, Box::new(right)));
            }
            K::Unary(unary) if is_sign(unary.op) => {
                let argument = self.render(E::new(unary.arg))?;
                return Some(Derived::Unary(unary.op, Box::new(argument)));
            }
            _ => {}
        }
        if reads(node, self.runtime) {
            return None;
        }
        match (self.evaluate)(node) {
            Some(value @ Value::Num(_)) => literal_value(&value).map(Derived::Literal),
            _ => None,
        }
    }

    fn register(&mut self, node: E, derived: Derived) {
        let key = span_key(node);
        let Some(first) = derived.first_param().map(str::to_string) else {
            if let Some(Value::Num(number)) = (self.evaluate)(node) {
                self.replacements.push((key, Replacement::Constant(number)));
            }
            return;
        };
        let name = match self.derived.iter().find(|entry| entry.expr == derived) {
            Some(entry) => entry.name.clone(),
            None => {
                let name = format!("{first}-{}", self.derived.len() + 1);
                self.derived.push(DerivedVar {
                    name: name.clone(),
                    expr: derived,
                });
                name
            }
        };
        self.replacements.push((key, Replacement::Derived(name)));
    }

    fn visit_object(&mut self, object: &ObjectExpression) {
        for prop in &object.properties {
            let Some(prop) = as_key_value(prop) else {
                continue;
            };
            self.visit(E::new(&prop.value));
        }
    }

    fn visit(&mut self, expression: E) {
        let node = unwrap(expression);
        let operands = match node.kind() {
            K::Object(object) => {
                self.visit_object(object);
                return;
            }
            K::Template(template) => {
                for expr in &template.expressions {
                    self.visit(E::new(expr));
                }
                return;
            }
            K::Binary(left, op, right) if is_arithmetic(op.0) => {
                (op.0 == BinaryOp::Add).then_some((left, right))
            }
            K::Unary(unary) if is_sign(unary.op) => None,
            _ => return,
        };
        if !reads(node, self.vars) {
            return;
        }
        if let Some(derived) = self.render(node) {
            self.register(node, derived);
            return;
        }
        if let Some((left, right)) = operands {
            self.visit(left);
            self.visit(right);
        }
    }
}

pub struct DynamicStyle {
    pub style: Object,
    pub var_groups: IndexMap<String, Vec<VarGroup>, FxBuildHasher>,
    pub derived: Vec<DerivedVar>,
}

fn attach_imports<'e, 'r>(
    evaluator: Evaluator<'e, 'r>,
    imports: Option<&'r dyn crate::oxc::eval::Imports>,
) -> Evaluator<'e, 'r> {
    match imports {
        Some(imports) => evaluator.importing(imports),
        None => evaluator,
    }
}

pub fn resolve_dynamic_style(
    func: &StyleFunction,
    runtime_params: &[String],
    statics: &dyn Lookup<Value>,
    tables: Env,
    provided: Option<&FxHashSet<String>>,
    definite: &[String],
    imports: Option<&dyn crate::oxc::eval::Imports>,
) -> EvalResult<DynamicStyle> {
    if func.unsupported_params {
        return Err(
            "[typedcss] Dynamic styles require named parameters or object destructuring; array and rest parameters are not supported."
                .to_string(),
        );
    }
    let mut temp: Layer<Value> = Layer::over(statics);

    let with_default: Vec<(String, &Expression)> = func
        .defaults
        .iter()
        .filter(|(param, _)| match provided {
            Some(provided) => !provided.contains(param.as_str()),
            None => temp.lookup(param).is_none(),
        })
        .map(|(param, expr)| (param.clone(), *expr))
        .collect();

    let mut default_literals: IndexMap<String, Value, FxBuildHasher> = IndexMap::default();
    for (param, expr) in &with_default {
        let node = unwrap(E::new(expr));
        if node.is_undefined_ident() {
            continue;
        }
        let is_definite = definite.contains(param)
            || !func
                .body
                .properties
                .iter()
                .any(|prop| reads_names_property(prop, &|name| name == param.as_str()));
        let literal =
            match attach_imports(Evaluator::new(tables.with_statics(statics)), imports).property_value(E::new(expr)) {
                Ok(literal) => literal,
                Err(_) if is_definite => continue,
                Err(error) => return Err(error),
            };
        match literal {
            Some(literal @ (Value::Str(_) | Value::Num(_))) => {
                default_literals.insert(param.clone(), literal);
            }
            _ if is_definite => {}
            other => return Err(default_error(param, node, other.as_ref())),
        }
    }
    let hole_defaults: IndexMap<String, Value, FxBuildHasher> = default_literals
        .iter()
        .filter(|(param, _)| !definite.contains(*param))
        .map(|(param, literal)| (param.clone(), literal.clone()))
        .collect();

    let mut var_params: Vec<String> = Vec::new();
    for param in runtime_params
        .iter()
        .chain(with_default.iter().map(|(param, _)| param))
    {
        if !var_params.contains(param) {
            var_params.push(param.clone());
        }
    }

    let mut constants: Layer<Value> = Layer::over(statics);
    for (param, literal) in &default_literals {
        if !runtime_params.contains(param) {
            constants.set(param.clone(), literal.clone());
        }
    }
    let evaluate = |node: E| {
        attach_imports(Evaluator::new(tables.with_statics(&constants)), imports)
            .property_value(node)
            .ok()
            .flatten()
    };
    let mut deriver = Deriver {
        runtime: runtime_params,
        vars: &var_params,
        defaults: &hole_defaults,
        evaluate: &evaluate,
        derived: Vec::new(),
        replacements: Vec::new(),
    };
    deriver.visit_object(func.body);
    let Deriver {
        derived,
        replacements: planned,
        ..
    } = deriver;

    let mut replacements = Replacements::default();
    for (key, replacement) in &planned {
        let value = match replacement {
            Replacement::Constant(number) => Value::Num(*number),
            Replacement::Derived(name) => Value::str(name.as_str()),
        };
        replacements.insert(*key, value);
    }

    let var_names: Vec<String> = var_params
        .iter()
        .cloned()
        .chain(derived.iter().map(|entry| entry.name.clone()))
        .collect();

    let mut css_vars: IndexMap<String, String, FxBuildHasher> = IndexMap::default();
    if !var_names.is_empty() {
        for param in &var_params {
            temp.set(param.clone(), Value::str(param.as_str()));
        }
        let probe = attach_imports(Evaluator::with_replacements(tables.with_statics(&temp), &replacements), imports)
            .object(func.body)?;
        let hash = hash_object(&probe);
        for name in &var_names {
            css_vars.insert(name.clone(), format!("--{hash}-{name}"));
        }
        for param in &var_params {
            temp.set(
                param.clone(),
                Value::Str(format!("var({})", css_vars[param])),
            );
        }
        for (key, replacement) in &planned {
            if let Replacement::Derived(name) = replacement {
                replacements.insert(*key, Value::Str(format!("var({})", css_vars[name])));
            }
        }
    }

    let mut style = attach_imports(Evaluator::with_replacements(tables.with_statics(&temp), &replacements), imports)
        .object(func.body)?;

    let mut var_groups: IndexMap<String, Vec<VarGroup>, FxBuildHasher> = IndexMap::default();
    for name in &var_names {
        let css_var = css_vars.get(name).cloned().unwrap_or_default();
        let groups = split_var_by_unit(&mut style, &css_var);
        var_groups.insert(name.clone(), groups);
    }

    for (param, literal) in &default_literals {
        if let Some(groups) = var_groups.get(param) {
            for group in groups.clone() {
                apply_var_fallback(
                    &mut style,
                    &group.css_var,
                    literal,
                    &VarUnit {
                        unit: group.unit.clone(),
                        written: group.written,
                    },
                );
            }
        }
    }

    Ok(DynamicStyle {
        style,
        var_groups,
        derived,
    })
}
