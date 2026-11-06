use rustc_hash::FxHashSet;
use swc_core::common::Spanned;
use swc_core::ecma::ast::*;

use crate::js::number::number_to_string;
use crate::js::{Object, Value};
use crate::swc::eval::Evaluator;
use crate::swc::eval::consts::ConstNodes;
use crate::swc::eval::functions::{Body, function_parts, param_view};
use crate::swc::syntax::expr::{E, str_value, swc_type_name};
use crate::swc::syntax::parse::Base;
use crate::swc::syntax::visit::expression_has_identifier;

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

fn key_value(prop: &KeyValueProp) -> Option<KeyVal> {
    match &prop.key {
        PropName::Ident(ident) => Some(KeyVal::Str(ident.sym.to_string())),
        PropName::Str(value) => Some(KeyVal::Str(str_value(value))),
        PropName::Num(value) => Some(KeyVal::Num(value.value)),
        _ => None,
    }
}

fn as_key_value(prop: &PropOrSpread) -> Option<&KeyValueProp> {
    match prop {
        PropOrSpread::Prop(prop) => match &**prop {
            Prop::KeyValue(pair) => Some(pair),
            _ => None,
        },
        PropOrSpread::Spread(_) => None,
    }
}

fn as_shorthand(prop: &PropOrSpread) -> Option<&Ident> {
    match prop {
        PropOrSpread::Prop(prop) => match &**prop {
            Prop::Shorthand(ident) => Some(ident),
            _ => None,
        },
        PropOrSpread::Spread(_) => None,
    }
}

fn unparen(expr: &Expr) -> &Expr {
    match expr {
        Expr::Paren(paren) => unparen(&paren.expr),
        other => other,
    }
}

struct SpreadInfo<'b> {
    values: Object,
    source: Option<&'b ObjectLit>,
}

pub struct Context<'c, 'e, 'r, 'b> {
    pub evaluator: Evaluator<'e, 'r>,
    pub const_nodes: &'c ConstNodes<'b>,
    pub source: &'c str,
    pub base: Base,
}

impl<'b> Context<'_, '_, '_, 'b> {
    fn spread(&self, prop: &'b PropOrSpread) -> Option<SpreadInfo<'b>> {
        let mut values = Object::new();
        self.evaluator.plain_property_into(prop, &mut values).ok()?;
        let source = match prop {
            PropOrSpread::Spread(spread) => match unparen(&spread.expr) {
                Expr::Ident(ident) => match self.const_nodes.get(ident.sym.as_str()) {
                    Some(expr) => match unparen(expr) {
                        Expr::Object(object) => Some(object),
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

    fn resolves_value(&self, value: &Expr) -> bool {
        matches!(self.evaluator.plain_property_value(E::new(value)), Ok(Some(_)))
    }

    fn source_of(&self, node: &Expr) -> String {
        self.base.text(self.source, node.span()).to_string()
    }

    fn unresolvable(&self, key: &str, node: &Expr) -> String {
        format!(
            "[typedcss] Cannot resolve the value of \"{key}\" at build time ({}). Values in css.create must be statically known; pass a runtime value through the function form, css.create({{ name: (value) => ({{ ... }}) }}).",
            self.source_of(node)
        )
    }

    fn overwritten_later(&self, properties: &'b [PropOrSpread], index: usize, key: &KeyVal) -> bool {
        for later in &properties[index + 1..] {
            if let PropOrSpread::Spread(_) = later {
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
                && KeyVal::Str(ident.sym.to_string()) == *key
            {
                return true;
            }
        }
        false
    }

    fn keys_supplied_after(&self, properties: &'b [PropOrSpread], index: usize) -> Option<FxHashSet<String>> {
        let mut keys = FxHashSet::default();
        for later in &properties[index + 1..] {
            if let PropOrSpread::Spread(_) = later {
                let provided = self.spread(later)?;
                for (name, _) in provided.values.iter() {
                    keys.insert(name.to_string());
                }
                continue;
            }
            if let Some(ident) = as_shorthand(later) {
                keys.insert(ident.sym.to_string());
                continue;
            }
            let Some(p) = as_key_value(later) else {
                continue;
            };
            keys.insert(key_value(p)?.text());
        }
        Some(keys)
    }

    fn assert_style_function(&self, func: &'b Expr) -> Result<(), String> {
        let Some((params, body)) = function_parts(func) else {
            return Ok(());
        };
        let mut names: FxHashSet<String> = FxHashSet::default();
        for param in params {
            let view = param_view(param);
            parameter_names(view.pattern, &mut names);
            if let Some(initializer) = view.initializer {
                expression_names(initializer, &mut names);
            }
        }
        let returned = match body {
            Body::Expr(expr) => match unparen(expr) {
                Expr::Object(object) => object,
                _ => return Ok(()),
            },
            Body::Block(_) => return Ok(()),
        };
        self.walk_style_function(returned, &names)
    }

    fn walk_style_function(&self, object: &'b ObjectLit, params: &FxHashSet<String>) -> Result<(), String> {
        for (index, prop) in object.props.iter().enumerate() {
            if let Some(ident) = as_shorthand(prop) {
                let name = ident.sym.to_string();
                let value = Expr::Ident(ident.clone());
                if !params.contains(&name)
                    && !self.overwritten_later(&object.props, index, &KeyVal::Str(name.clone()))
                    && !self.resolves_value(&value)
                {
                    return Err(self.unresolvable(&name, &value));
                }
                continue;
            }
            let Some(p) = as_key_value(prop) else {
                continue;
            };
            let key = key_value(p);
            if let Some(key) = &key
                && self.overwritten_later(&object.props, index, key)
            {
                continue;
            }
            let value = unparen(&p.value);
            if let Expr::Object(inner) = value {
                self.walk_style_function(inner, params)?;
                continue;
            }
            let reads = expression_has_identifier(value, &|name| params.contains(name));
            let key_text = key.as_ref().map(KeyVal::text).unwrap_or_default();
            let runtime_only = matches!(
                swc_type_name(value),
                "CallExpression" | "NewExpression" | "AwaitExpression" | "TaggedTemplateExpression" | "YieldExpression"
            );
            if runtime_only && !reads {
                return Err(self.unresolvable(&key_text, value));
            }
            let is_reference = matches!(swc_type_name(value), "Identifier" | "MemberExpression");
            if is_reference && !reads && !self.resolves_value(value) {
                return Err(self.unresolvable(&key_text, value));
            }
        }
        Ok(())
    }

    pub fn assert_no_dropped_values(
        &self,
        node: &'b ObjectLit,
        resolved: &Object,
        ignore: Option<&FxHashSet<String>>,
    ) -> Result<(), String> {
        for (index, prop) in node.props.iter().enumerate() {
            if let PropOrSpread::Spread(_) = prop {
                let Some(provided) = self.spread(prop) else {
                    continue;
                };
                let Some(source) = provided.source else {
                    continue;
                };
                if let Some(replaced) = self.keys_supplied_after(&node.props, index) {
                    self.assert_no_dropped_values(source, &provided.values, Some(&replaced))?;
                }
                continue;
            }
            if let Some(ident) = as_shorthand(prop) {
                let name = ident.sym.to_string();
                if ignore.is_some_and(|ignore| ignore.contains(&name))
                    || self.overwritten_later(&node.props, index, &KeyVal::Str(name.clone()))
                    || resolved.contains_key(&name)
                {
                    continue;
                }
                return Err(self.unresolvable(&name, &Expr::Ident(ident.clone())));
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
            if self.overwritten_later(&node.props, index, &key) {
                continue;
            }
            let value = unparen(&p.value);
            if matches!(value, Expr::Arrow(_) | Expr::Fn(_)) {
                self.assert_style_function(value)?;
                continue;
            }
            if matches!(value, Expr::Lit(Lit::Null(_))) {
                continue;
            }
            let Some(nested) = resolved.get(&key_text) else {
                return Err(self.unresolvable(&key_text, value));
            };
            if let Expr::Object(inner) = value
                && let Value::Obj(nested) = nested
            {
                self.assert_no_dropped_values(inner, nested, None)?;
            }
        }
        Ok(())
    }
}

fn parameter_names(pattern: &Pat, out: &mut FxHashSet<String>) {
    match pattern {
        Pat::Ident(ident) => {
            out.insert(ident.id.sym.to_string());
        }
        Pat::Object(object) => {
            for prop in &object.props {
                match prop {
                    ObjectPatProp::Assign(assign) => {
                        out.insert(assign.key.id.sym.to_string());
                        if let Some(value) = &assign.value {
                            expression_names(value, out);
                        }
                    }
                    ObjectPatProp::KeyValue(pair) => {
                        if let PropName::Ident(ident) = &pair.key {
                            out.insert(ident.sym.to_string());
                        }
                        parameter_names(&pair.value, out);
                    }
                    ObjectPatProp::Rest(rest) => parameter_names(&rest.arg, out),
                }
            }
        }
        Pat::Array(array) => {
            for element in array.elems.iter().flatten() {
                parameter_names(element, out);
            }
        }
        Pat::Rest(rest) => parameter_names(&rest.arg, out),
        Pat::Assign(assign) => parameter_names(&assign.left, out),
        _ => {}
    }
}

fn expression_names(expr: &Expr, out: &mut FxHashSet<String>) {
    match expr {
        Expr::Ident(ident) => {
            out.insert(ident.sym.to_string());
        }
        Expr::Bin(binary) => expression_names(&binary.left, out),
        Expr::Unary(unary) => expression_names(&unary.arg, out),
        _ => {}
    }
}
