use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};

use crate::engine::logical_physical::{Spelling, counterpart_of, spelling_of};
use crate::engine::{camel_to_kebab_case, kebab_to_camel_case};
use crate::fs::path::basename;
use crate::policy::PropertyPolicy;
use crate::oxc::syntax::expr::{Key, argument_expression, as_key_value, str_value};
use crate::oxc::syntax::module::{Aliases, CORE, add_core_aliases, plumeria_method};

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

fn style_object_of<'b>(node: &'b Expression<'b>) -> Option<&'b ObjectExpression<'b>> {
    match node {
        Expression::ObjectExpression(object) => Some(object),
        Expression::ArrowFunctionExpression(arrow) => match &arrow.body {
            ArrowFunctionBody::ObjectExpression(object) => Some(object),
            ArrowFunctionBody::ParenthesizedExpression(paren) => style_object_of(&paren.expression),
            _ => None,
        },
        _ => None,
    }
}

fn key_name(prop: &ObjectProperty) -> String {
    Key::of(prop).name().unwrap_or_default()
}

fn key_values<'b>(object: &'b ObjectExpression<'b>) -> impl Iterator<Item = &'b ObjectProperty<'b>> {
    object.properties.iter().filter_map(as_key_value)
}

struct Check<'p> {
    policy: PropertyPolicy,
    resource: &'p str,
    aliases: Aliases,
    error: Option<String>,
}

impl Check<'_> {
    fn check(&mut self, node: &ObjectExpression) {
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

impl<'a> Visit<'a> for Check<'_> {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        if str_value(&it.source) == CORE {
            add_core_aliases(it, &mut self.aliases);
        }
    }

    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.error.is_some() {
            return;
        }
        let api = plumeria_method(&it.callee, &self.aliases).map(str::to_string);
        if let Some(api) = api
            && ["create", "keyframes", "viewTransitionClass", "positionTry"].contains(&api.as_str())
        {
            for argument in &it.arguments {
                let Expression::ObjectExpression(object) = argument_expression(argument) else {
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
        walk::walk_call_expression(self, it);
    }
}

pub fn assert_property_policy(
    program: &Program,
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
    for item in &program.body {
        if let Statement::ImportDeclaration(decl) = item {
            check.visit_import_declaration(decl);
        }
    }
    check.visit_program(program);
    match check.error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}
