use rustc_hash::FxHashMap;
use swc_core::ecma::ast::*;

use super::expr::{E, K, Prop};

pub const CORE: &str = "@typedcss/css";
pub const NAMESPACE: &str = "NAMESPACE";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SpecKind {
    Named,
    Default,
    Namespace,
}

pub struct ImportSpec<'b> {
    pub kind: SpecKind,
    pub local: &'b str,
    pub imported: String,
    pub type_only: bool,
}

pub fn module_export_name(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::Ident(ident) => ident.sym.to_string(),
        ModuleExportName::Str(value) => super::expr::str_value(value),
    }
}

pub fn import_source(decl: &ImportDecl) -> String {
    super::expr::str_value(&decl.src)
}

pub fn import_specs(decl: &ImportDecl) -> Vec<ImportSpec<'_>> {
    decl.specifiers
        .iter()
        .map(|specifier| match specifier {
            ImportSpecifier::Named(spec) => ImportSpec {
                kind: SpecKind::Named,
                local: spec.local.sym.as_str(),
                imported: spec
                    .imported
                    .as_ref()
                    .map(module_export_name)
                    .unwrap_or_else(|| spec.local.sym.to_string()),
                type_only: spec.is_type_only,
            },
            ImportSpecifier::Default(spec) => ImportSpec {
                kind: SpecKind::Default,
                local: spec.local.sym.as_str(),
                imported: "default".to_string(),
                type_only: false,
            },
            ImportSpecifier::Namespace(spec) => ImportSpec {
                kind: SpecKind::Namespace,
                local: spec.local.sym.as_str(),
                imported: "*".to_string(),
                type_only: false,
            },
        })
        .collect()
}

pub type Aliases = FxHashMap<String, String>;

pub fn add_core_aliases(decl: &ImportDecl, aliases: &mut Aliases) {
    for spec in import_specs(decl) {
        let value = match spec.kind {
            SpecKind::Named => spec.imported.clone(),
            SpecKind::Default | SpecKind::Namespace => NAMESPACE.to_string(),
        };
        aliases.insert(spec.local.to_string(), value);
    }
}

pub fn plumeria_method<'b>(callee: &'b Expr, aliases: &'b Aliases) -> Option<&'b str> {
    let callee = E::new(callee);
    match callee.kind() {
        K::Member(member) => {
            let object = callee.member_object(member).ident_name()?;
            let Some(Prop::Name(property)) = callee.prop() else {
                return None;
            };
            match aliases.get(object) {
                Some(alias) if alias == NAMESPACE => Some(property),
                _ => None,
            }
        }
        K::Ident(ident) => aliases.get(ident.sym.as_str()).map(String::as_str),
        _ => None,
    }
}
