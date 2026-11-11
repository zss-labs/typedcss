use rustc_hash::FxHashSet;
use oxc_ast::ast::*;
use oxc_span::{GetSpan, Span};

use crate::js::number::number_to_string;
use crate::js::{Object, Value};
use crate::oxc::eval::Evaluator;
use crate::oxc::eval::consts::ConstNodes;
use crate::oxc::eval::functions::{Body, function_parts};
use crate::oxc::syntax::expr::{E, Key, as_key_value, as_shorthand, type_name};
use crate::oxc::syntax::parse::Base;
use crate::oxc::syntax::visit::expression_has_identifier;

const STATIC_HINT: &str = "Values in css.create must be statically known; pass a runtime value through the function form, css.create({ name: (value) => ({ ... }) }).";
const DYNAMIC_HINT: &str = "A dynamic style hands its parameters to CSS variables and cannot choose between values; write each choice as a static style and choose where it is applied, [on ? styles.a : styles.b].";

#[derive(Clone, PartialEq)]
enum KeyVal {
    Str(String),
    Num(f64),
}

impl KeyVal {
    fn text(&self) -> String {
        match self {
            KeyVal::Str(text) => text.clone(),
            KeyVal::Num(number) => number_to_string(*number),
        }
    }
}

fn key_value(prop: &ObjectProperty) -> Option<KeyVal> {
    match Key::of(prop) {
        Key::Num(value) => Some(KeyVal::Num(value)),
        key => key.name().map(KeyVal::Str),
    }
}

fn unparen<'b>(expr: &'b Expression<'b>) -> &'b Expression<'b> {
    match expr {
        Expression::ParenthesizedExpression(paren) => unparen(&paren.expression),
        other => other,
    }
}

struct SpreadInfo<'b> {
    values: Object,
    source: Option<&'b ObjectExpression<'b>>,
}

pub struct Context<'c, 'e, 'r, 'b> {
    pub evaluator: Evaluator<'e, 'r>,
    pub const_nodes: &'c ConstNodes<'b>,
    pub source: &'c str,
    pub base: Base,
}

impl<'b> Context<'_, '_, '_, 'b> {
    fn spread(&self, prop: &'b ObjectPropertyKind<'b>) -> Option<SpreadInfo<'b>> {
        let mut values = Object::new();
        self.evaluator.plain_property_into(prop, &mut values).ok()?;
        let source = match prop {
            ObjectPropertyKind::SpreadProperty(spread) => match unparen(&spread.argument) {
                Expression::Identifier(ident) => match self.const_nodes.get(ident.name.as_str()) {
                    Some(expr) => match unparen(expr) {
                        Expression::ObjectExpression(object) => Some(&**object),
                        _ => None,
                    },
                    None => None,
                },
                _ => None,
            },
            _ => None,
        };
        Some(SpreadInfo { values, source })
    }

    fn resolves_value(&self, value: E) -> bool {
        matches!(self.evaluator.plain_property_value(value), Ok(Some(_)))
    }

    fn source_of(&self, span: Span) -> String {
        self.base.text(self.source, span).to_string()
    }

    fn unresolvable(&self, key: &str, span: Span) -> String {
        format!(
            "[typedcss] Cannot resolve the value of \"{key}\" at build time ({}). {STATIC_HINT}",
            self.source_of(span)
        )
    }

    pub fn assert_no_dropped_dynamic_values(&self, body: &'b ObjectExpression<'b>, resolved: &Object) -> Result<(), String> {
        self.assert_no_dropped_values(body, resolved, None)
            .map_err(|error| error.replace(STATIC_HINT, DYNAMIC_HINT))
    }

    fn overwritten_later(&self, properties: &'b [ObjectPropertyKind<'b>], index: usize, key: &KeyVal) -> bool {
        for later in &properties[index + 1..] {
            if let ObjectPropertyKind::SpreadProperty(_) = later {
                match self.spread(later) {
                    None => return true,
                    Some(provided) => {
                        if provided.values.contains_key(&key.text()) {
                            return true;
                        }
                    }
                }
                continue;
            }
            if let Some(p) = as_key_value(later)
                && key_value(p).as_ref() == Some(key)
            {
                return true;
            }
            if let Some(ident) = as_shorthand(later)
                && KeyVal::Str(ident.name.to_string()) == *key
            {
                return true;
            }
        }
        false
    }

    fn keys_supplied_after(&self, properties: &'b [ObjectPropertyKind<'b>], index: usize) -> Option<FxHashSet<String>> {
        let mut keys = FxHashSet::default();
        for later in &properties[index + 1..] {
            if let ObjectPropertyKind::SpreadProperty(_) = later {
                let provided = self.spread(later)?;
                for (name, _) in provided.values.iter() {
                    keys.insert(name.to_string());
                }
                continue;
            }
            if let Some(ident) = as_shorthand(later) {
                keys.insert(ident.name.to_string());
                continue;
            }
            let Some(p) = as_key_value(later) else {
                continue;
            };
            keys.insert(key_value(p)?.text());
        }
        Some(keys)
    }

    fn assert_style_function(&self, func: &'b Expression<'b>) -> Result<(), String> {
        let Some((params, body)) = function_parts(func) else {
            return Ok(());
        };
        let mut names: FxHashSet<String> = FxHashSet::default();
        for view in params {
            parameter_names(view.pattern, &mut names);
            if let Some(initializer) = view.initializer {
                expression_names(initializer, &mut names);
            }
        }
        let returned = match body {
            Body::Expr(expr) => match unparen(expr) {
                Expression::ObjectExpression(object) => object,
                _ => return Ok(()),
            },
            Body::Block(_) => return Ok(()),
        };
        self.walk_style_function(returned, &names)
    }

    fn walk_style_function(&self, object: &'b ObjectExpression<'b>, params: &FxHashSet<String>) -> Result<(), String> {
        for (index, prop) in object.properties.iter().enumerate() {
            if let Some(ident) = as_shorthand(prop) {
                let name = ident.name.to_string();
                if !params.contains(&name)
                    && !self.overwritten_later(&object.properties, index, &KeyVal::Str(name.clone()))
                    && !self.resolves_value(E::ident(ident))
                {
                    return Err(self.unresolvable(&name, ident.span));
                }
                continue;
            }
            let Some(p) = as_key_value(prop) else {
                continue;
            };
            let key = key_value(p);
            if let Some(key) = &key
                && self.overwritten_later(&object.properties, index, key)
            {
                continue;
            }
            let value = unparen(&p.value);
            if let Expression::ObjectExpression(inner) = value {
                self.walk_style_function(inner, params)?;
                continue;
            }
            let reads = expression_has_identifier(value, &|name| params.contains(name));
            let key_text = key.as_ref().map(KeyVal::text).unwrap_or_default();
            if reads && !carried(value, params) {
                return Err(self.unresolvable(&key_text, value.span()).replace(STATIC_HINT, DYNAMIC_HINT));
            }
            let runtime_only = matches!(
                type_name(value),
                "CallExpression" | "NewExpression" | "AwaitExpression" | "TaggedTemplateExpression" | "YieldExpression"
            );
            if runtime_only && !reads {
                return Err(self.unresolvable(&key_text, value.span()));
            }
            let is_reference = matches!(type_name(value), "Identifier" | "MemberExpression");
            if is_reference && !reads && !self.resolves_value(E::new(value)) {
                return Err(self.unresolvable(&key_text, value.span()));
            }
        }
        Ok(())
    }

    pub fn assert_no_dropped_values(
        &self,
        node: &'b ObjectExpression<'b>,
        resolved: &Object,
        ignore: Option<&FxHashSet<String>>,
    ) -> Result<(), String> {
        for (index, prop) in node.properties.iter().enumerate() {
            if let ObjectPropertyKind::SpreadProperty(_) = prop {
                let Some(provided) = self.spread(prop) else {
                    continue;
                };
                let Some(source) = provided.source else {
                    continue;
                };
                if let Some(replaced) = self.keys_supplied_after(&node.properties, index) {
                    self.assert_no_dropped_values(source, &provided.values, Some(&replaced))?;
                }
                continue;
            }
            if let Some(ident) = as_shorthand(prop) {
                let name = ident.name.to_string();
                if ignore.is_some_and(|ignore| ignore.contains(&name))
                    || self.overwritten_later(&node.properties, index, &KeyVal::Str(name.clone()))
                    || resolved.contains_key(&name)
                {
                    continue;
                }
                return Err(self.unresolvable(&name, ident.span));
            }
            let Some(p) = as_key_value(prop) else {
                continue;
            };
            let Some(key) = key_value(p) else { continue };
            let key_text = key.text();
            let key_text = if key_text.contains("/*") {
                crate::engine::specificity::strip_selector_comments(&key_text).into_owned()
            } else {
                key_text
            };
            if ignore.is_some_and(|ignore| ignore.contains(&key_text)) {
                continue;
            }
            if self.overwritten_later(&node.properties, index, &key) {
                continue;
            }
            let value = unparen(&p.value);
            if matches!(value, Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_)) {
                self.assert_style_function(value)?;
                continue;
            }
            if matches!(value, Expression::NullLiteral(_)) {
                continue;
            }
            let Some(nested) = resolved.get(&key_text) else {
                return Err(self.unresolvable(&key_text, value.span()));
            };
            if let Expression::ObjectExpression(inner) = value
                && let Value::Obj(nested) = nested
            {
                self.assert_no_dropped_values(inner, nested, None)?;
            }
        }
        Ok(())
    }
}

fn carried(expr: &Expression, params: &FxHashSet<String>) -> bool {
    let part = |expr: &Expression| {
        !expression_has_identifier(expr, &|name| params.contains(name)) || carried(expr, params)
    };
    match unparen(expr) {
        Expression::Identifier(_) => true,
        Expression::TemplateLiteral(template) => template.expressions.iter().all(part),
        Expression::BinaryExpression(binary) => {
            matches!(
                binary.operator,
                BinaryOperator::Addition
                    | BinaryOperator::Subtraction
                    | BinaryOperator::Multiplication
                    | BinaryOperator::Division
                    | BinaryOperator::Remainder
                    | BinaryOperator::Exponential
            ) && part(&binary.left)
                && part(&binary.right)
        }
        Expression::UnaryExpression(unary) => {
            matches!(unary.operator, UnaryOperator::UnaryNegation | UnaryOperator::UnaryPlus) && part(&unary.argument)
        }
        Expression::TSAsExpression(cast) => carried(&cast.expression, params),
        Expression::TSSatisfiesExpression(cast) => carried(&cast.expression, params),
        Expression::TSNonNullExpression(cast) => carried(&cast.expression, params),
        _ => false,
    }
}

fn parameter_names(pattern: &BindingPattern, out: &mut FxHashSet<String>) {
    match pattern {
        BindingPattern::BindingIdentifier(ident) => {
            out.insert(ident.name.to_string());
        }
        BindingPattern::ObjectPattern(object) => {
            for prop in &object.properties {
                if prop.shorthand {
                    match &prop.value {
                        BindingPattern::AssignmentPattern(assign) => {
                            parameter_names(&assign.left, out);
                            expression_names(&assign.right, out);
                        }
                        value => parameter_names(value, out),
                    }
                    continue;
                }
                if let Key::Ident(name) = Key::of_binding(prop) {
                    out.insert(name.to_string());
                }
                parameter_names(&prop.value, out);
            }
            if let Some(rest) = &object.rest {
                parameter_names(&rest.argument, out);
            }
        }
        BindingPattern::ArrayPattern(array) => {
            for element in array.elements.iter().flatten() {
                parameter_names(element, out);
            }
            if let Some(rest) = &array.rest {
                parameter_names(&rest.argument, out);
            }
        }
        BindingPattern::AssignmentPattern(assign) => parameter_names(&assign.left, out),
    }
}

fn expression_names(expr: &Expression, out: &mut FxHashSet<String>) {
    match expr {
        Expression::Identifier(ident) => {
            out.insert(ident.name.to_string());
        }
        Expression::BinaryExpression(binary) => expression_names(&binary.left, out),
        Expression::LogicalExpression(logical) => expression_names(&logical.left, out),
        Expression::UnaryExpression(unary) => expression_names(&unary.argument, out),
        _ => {}
    }
}
