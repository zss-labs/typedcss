use rustc_hash::FxHashMap;
use oxc_ast::ast::*;

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
        ModuleExportName::IdentifierName(ident) => ident.name.to_string(),
        ModuleExportName::IdentifierReference(ident) => ident.name.to_string(),
        ModuleExportName::StringLiteral(value) => super::expr::str_value(value),
    }
}

pub fn import_source(decl: &ImportDeclaration) -> String {
    super::expr::str_value(&decl.source)
}

pub fn import_specs<'b>(decl: &'b ImportDeclaration<'b>) -> Vec<ImportSpec<'b>> {
    decl.specifiers
        .iter()
        .flatten()
        .map(|specifier| match specifier {
            ImportDeclarationSpecifier::ImportSpecifier(spec) => ImportSpec {
                kind: SpecKind::Named,
                local: spec.local.name.as_str(),
                imported: module_export_name(&spec.imported),
                type_only: spec.import_kind.is_type(),
            },
            ImportDeclarationSpecifier::ImportDefaultSpecifier(spec) => ImportSpec {
                kind: SpecKind::Default,
                local: spec.local.name.as_str(),
                imported: "default".to_string(),
                type_only: false,
            },
            ImportDeclarationSpecifier::ImportNamespaceSpecifier(spec) => ImportSpec {
                kind: SpecKind::Namespace,
                local: spec.local.name.as_str(),
                imported: "*".to_string(),
                type_only: false,
            },
        })
        .collect()
}

pub type Aliases = FxHashMap<String, String>;

pub fn add_core_aliases(decl: &ImportDeclaration, aliases: &mut Aliases) {
    for spec in import_specs(decl) {
        let value = match spec.kind {
            SpecKind::Named => spec.imported.clone(),
            SpecKind::Default | SpecKind::Namespace => NAMESPACE.to_string(),
        };
        aliases.insert(spec.local.to_string(), value);
    }
}

pub fn plumeria_method<'b>(callee: &'b Expression<'b>, aliases: &'b Aliases) -> Option<&'b str> {
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
        K::Ident(ident) => aliases.get(ident.name.as_str()).map(String::as_str),
        _ => None,
    }
}
