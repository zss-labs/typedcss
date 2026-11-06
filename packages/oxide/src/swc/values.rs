use std::sync::{Mutex, OnceLock};

use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::ecma::ast::*;

use crate::swc::eval::Env;
use crate::fs::resolver::Resolver;
use crate::fs::source::{SourceStamp, stamp};
use crate::js::{Object, Value};
use crate::swc::eval::consts::{collect_local_const_nodes, collect_local_consts};
use crate::swc::eval::{Evaluator, argument_expr};
use crate::swc::syntax::expr::{E, K, Prop, str_value, unwrap};
use crate::swc::syntax::module::{CORE, SpecKind, import_source, import_specs, module_export_name};
use crate::swc::syntax::parse::parse_program;

#[derive(Clone)]
struct Import {
    source: String,
    name: String,
}

#[derive(Clone)]
struct ConstFile {
    stamp: SourceStamp,
    values: Object,
    imports: FxHashMap<String, Import>,
    exports: FxHashMap<String, String>,
    reexports: FxHashMap<String, Import>,
    star_reexports: Vec<String>,
}

#[derive(Default)]
struct Project {
    resolver: Resolver,
    files: FxHashMap<String, ConstFile>,
}

fn project() -> std::sync::MutexGuard<'static, Project> {
    static PROJECT: OnceLock<Mutex<Project>> = OnceLock::new();
    PROJECT
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn is_create_static(callee: E, names: &FxHashSet<String>, namespaces: &FxHashSet<String>) -> bool {
    match callee.kind() {
        K::Ident(ident) => names.contains(ident.sym.as_str()),
        K::Member(_) => {
            callee
                .object()
                .and_then(|object| object.ident_name())
                .is_some_and(|object| namespaces.contains(object))
                && matches!(callee.prop(), Some(Prop::Name("createStatic")))
        }
        _ => false,
    }
}

fn read_const_file(path: &str, stamp: SourceStamp) -> Option<ConstFile> {
    let source = crate::fs::source::read(path).ok()?;
    let parsed = parse_program(&source).ok()?;
    let module = &parsed.module;
    let mut values = collect_local_consts(module, None);
    let mut imports = FxHashMap::default();
    let mut exports = FxHashMap::default();
    let mut reexports = FxHashMap::default();
    let mut star_reexports = Vec::new();
    let mut create_static = FxHashSet::default();
    let mut namespaces = FxHashSet::default();

    for item in &module.body {
        let ModuleItem::ModuleDecl(decl) = item else { continue };
        match decl {
            ModuleDecl::Import(import) => {
                let source = import_source(import);
                for spec in import_specs(import) {
                    let name = match spec.kind {
                        SpecKind::Named => spec.imported.clone(),
                        SpecKind::Default => "default".to_string(),
                        SpecKind::Namespace => "*".to_string(),
                    };
                    if source == CORE {
                        if name == "createStatic" {
                            create_static.insert(spec.local.to_string());
                        } else if name == "*" || name == "default" {
                            namespaces.insert(spec.local.to_string());
                        }
                    }
                    imports.insert(spec.local.to_string(), Import { source: source.clone(), name });
                }
            }
            ModuleDecl::ExportDecl(export) => {
                if let Decl::Var(var) = &export.decl {
                    for declarator in &var.decls {
                        if let Pat::Ident(name) = &declarator.name {
                            let name = name.id.sym.to_string();
                            exports.insert(name.clone(), name);
                        }
                    }
                }
            }
            ModuleDecl::ExportNamed(named) => {
                let source = named.src.as_ref().map(|src| str_value(src));
                for spec in &named.specifiers {
                    let ExportSpecifier::Named(spec) = spec else { continue };
                    if spec.is_type_only {
                        continue;
                    }
                    let local = module_export_name(&spec.orig);
                    let exported = spec.exported.as_ref().map(module_export_name).unwrap_or_else(|| local.clone());
                    match &source {
                        Some(source) => {
                            reexports.insert(exported, Import { source: source.clone(), name: local });
                        }
                        None => {
                            exports.insert(exported, local);
                        }
                    }
                }
            }
            ModuleDecl::ExportAll(all) => star_reexports.push(str_value(&all.src)),
            ModuleDecl::ExportDefaultExpr(export) => match unwrap(E::new(&export.expr)).kind() {
                K::Str(value) => values.insert("default", Value::str(str_value(value))),
                K::Num(value) => values.insert("default", Value::Num(value.value)),
                K::Ident(ident) => {
                    exports.insert("default".to_string(), ident.sym.to_string());
                }
                _ => {}
            },
            _ => {}
        }
    }

    for (name, node) in collect_local_const_nodes(module) {
        let K::Call(call) = unwrap(E::new(node)).kind() else { continue };
        let Some(callee) = call.callee else { continue };
        if !is_create_static(unwrap(E::new(callee)), &create_static, &namespaces) {
            continue;
        }
        let Some(K::Object(object)) = call.args.first().map(|argument| unwrap(argument_expr(argument)).kind()) else {
            continue;
        };
        let snapshot = values.clone();
        if let Ok(object) = Evaluator::new(Env::statics_only(&snapshot)).object(object) {
            values.insert(name, Value::obj(object));
        }
    }

    Some(ConstFile {
        stamp,
        values,
        imports,
        exports,
        reexports,
        star_reexports,
    })
}

impl Project {
    fn file(&mut self, path: &str) -> Option<ConstFile> {
        let current = stamp(path).ok()?;
        if let Some(cached) = self.files.get(path).filter(|cached| cached.stamp == current) {
            return Some(cached.clone());
        }
        let file = read_const_file(path, current)?;
        self.files.insert(path.to_string(), file.clone());
        Some(file)
    }

    fn value(&mut self, file: &str, name: &str, visited: &mut FxHashSet<String>) -> Option<Value> {
        if !visited.insert(format!("{file}\0{name}")) {
            return None;
        }
        let loaded = self.file(file)?;
        let local = loaded.exports.get(name).map(String::as_str).unwrap_or(name);
        if let Some(value) = loaded.values.get(local) {
            return Some(value.clone());
        }
        let next = loaded.imports.get(local).or_else(|| loaded.reexports.get(name));
        if let Some(next) = next {
            if next.name == "*" {
                return None;
            }
            let target = self.resolver.resolve_import_path(&next.source, file)?;
            return self.value(&target, &next.name, visited);
        }
        for source in &loaded.star_reexports {
            let Some(target) = self.resolver.resolve_import_path(source, file) else { continue };
            if let Some(value) = self.value(&target, name, visited) {
                return Some(value);
            }
        }
        None
    }
}

pub fn resolve_import_path(import_path: &str, importer: &str) -> Option<String> {
    project().resolver.resolve_import_path(import_path, importer)
}

pub fn resolve_export_value(file: &str, name: &str) -> Option<Value> {
    project().value(file, name, &mut FxHashSet::default())
}
