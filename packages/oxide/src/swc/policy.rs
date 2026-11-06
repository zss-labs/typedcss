use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitWith};

use crate::engine::logical_physical::{Spelling, counterpart_of, spelling_of};
use crate::engine::{camel_to_kebab_case, kebab_to_camel_case};
use crate::fs::path::basename;
use crate::policy::PropertyPolicy;
use crate::swc::syntax::expr::str_value;
use crate::swc::syntax::module::{Aliases, CORE, add_core_aliases, plumeria_method};

fn message(reject: Spelling, name: &str, counterpart: &str) -> String {
    match reject {
        Spelling::Physical => format!(
            "'{name}' is the physical name of this property. Write it as '{counterpart}', which follows the writing mode."
        ),
        Spelling::Logical => format!(
            "'{name}' is the logical name of this property. This project is written in physical properties; use '{counterpart}'."
        ),
    }
}

fn style_object_of(node: &Expr) -> Option<&ObjectLit> {
    match node {
        Expr::Object(object) => Some(object),
        Expr::Arrow(arrow) => match &*arrow.body {
            ArrowFunctionBody::Expr(expr) => match &**expr {
                Expr::Object(object) => Some(object),
                Expr::Paren(paren) => style_object_of(&paren.expr),
                _ => None,
            },
            _ => None,
        },
        _ => None,
    }
}

fn key_name(prop: &KeyValueProp) -> String {
    match &prop.key {
        PropName::Ident(ident) => ident.sym.to_string(),
        PropName::Str(value) => str_value(value),
        _ => String::new(),
    }
}

fn key_values(object: &ObjectLit) -> impl Iterator<Item = &KeyValueProp> {
    object.props.iter().filter_map(|prop| match prop {
        PropOrSpread::Prop(prop) => match &**prop {
            Prop::KeyValue(pair) => Some(pair),
            _ => None,
        },
        _ => None,
    })
}

struct Check<'p> {
    policy: PropertyPolicy,
    resource: &'p str,
    aliases: Aliases,
    error: Option<String>,
}

impl Check<'_> {
    fn check(&mut self, node: &ObjectLit) {
        for prop in key_values(node) {
            if self.error.is_some() {
                return;
            }
            if let Some(nested) = style_object_of(&prop.value) {
                self.check(nested);
                continue;
            }
            let name = key_name(prop);
            if name.is_empty() {
                continue;
            }
            let kebab = camel_to_kebab_case(&name);
            if spelling_of(&kebab, self.policy.include_axes) != Some(self.policy.reject) {
                continue;
            }
            let counterpart = kebab_to_camel_case(counterpart_of(&kebab).unwrap_or(""));
            self.error = Some(format!(
                "[typedcss] {} ({})",
                message(self.policy.reject, &name, &counterpart),
                basename(self.resource)
            ));
        }
    }
}

impl Visit for Check<'_> {
    fn visit_import_decl(&mut self, it: &ImportDecl) {
        if str_value(&it.src) == CORE {
            add_core_aliases(it, &mut self.aliases);
        }
    }

    fn visit_call_expr(&mut self, it: &CallExpr) {
        if self.error.is_some() {
            return;
        }
        let api = match &it.callee {
            Callee::Expr(callee) => plumeria_method(callee, &self.aliases).map(str::to_string),
            _ => None,
        };
        if let Some(api) = api
            && ["create", "keyframes", "viewTransitionClass", "positionTry"].contains(&api.as_str())
        {
            for argument in &it.args {
                let Expr::Object(object) = &*argument.expr else {
                    continue;
                };
                if api == "positionTry" {
                    self.check(object);
                    if self.error.is_some() {
                        return;
                    }
                    continue;
                }
                for prop in key_values(object) {
                    if let Some(style) = style_object_of(&prop.value) {
                        self.check(style);
                        if self.error.is_some() {
                            return;
                        }
                    }
                }
            }
        }
        it.visit_children_with(self);
    }
}

pub fn assert_property_policy(
    module: &Module,
    policy: Option<PropertyPolicy>,
    resource: &str,
) -> Result<(), String> {
    let Some(policy) = policy else { return Ok(()) };
    let mut check = Check {
        policy,
        resource,
        aliases: Aliases::default(),
        error: None,
    };
    for item in &module.body {
        if let ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) = item {
            check.visit_import_decl(decl);
        }
    }
    module.visit_with(&mut check);
    match check.error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
