use std::cell::RefCell;

use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashSet};
use oxc_ast::ast::*;

use super::{Env, Evaluator, Imports, Lookup};
use crate::js::{Object, Value};
use crate::oxc::syntax::expr::{E, K, str_value, unwrap};

pub type ConstNodes<'b> = IndexMap<&'b str, &'b Expression<'b>, FxBuildHasher>;

pub fn top_level_variable_declarations<'b>(program: &'b Program<'b>) -> impl Iterator<Item = &'b VariableDeclaration<'b>> {
    program.body.iter().filter_map(|item| match item {
        Statement::VariableDeclaration(declaration) => Some(&**declaration),
        Statement::ExportDeclaration(export) => match &export.declaration {
            Declaration::VariableDeclaration(declaration) => Some(&**declaration),
            _ => None,
        },
        _ => None,
    })
}

pub fn binding_name<'b>(pattern: &'b BindingPattern<'b>) -> Option<&'b str> {
    match pattern {
        BindingPattern::BindingIdentifier(ident) => Some(ident.name.as_str()),
        _ => None,
    }
}

pub fn collect_local_const_nodes<'b>(program: &'b Program<'b>) -> ConstNodes<'b> {
    let mut nodes = ConstNodes::default();
    for declaration in top_level_variable_declarations(program) {
        for declarator in &declaration.declarations {
            if let (Some(name), Some(init)) = (binding_name(&declarator.id), &declarator.init) {
                nodes.insert(name, init);
            }
        }
    }
    nodes
}

struct Consts<'b, 'i> {
    decls: ConstNodes<'b>,
    values: RefCell<Object>,
    visiting: RefCell<FxHashSet<String>>,
    imports: Option<&'i dyn Imports>,
}

struct Live<'c>(&'c RefCell<Object>);

impl Lookup<Value> for Live<'_> {
    fn lookup(&self, key: &str) -> Option<Value> {
        self.0.borrow().get(key).cloned()
    }
}

impl Consts<'_, '_> {
    fn resolve(&self, name: &str) -> Option<Value> {
        if let Some(value) = self.values.borrow().get(name) {
            return Some(value.clone());
        }
        let init = *self.decls.get(name)?;
        if self.visiting.borrow().contains(name) {
            return None;
        }
        self.visiting.borrow_mut().insert(name.to_string());
        let init = unwrap(E::new(init));
        let live = Live(&self.values);
        let env = Env::statics_only(&live);
        let result = match init.kind() {
            K::Str(value) => Some(Value::Str(str_value(value))),
            K::Num(value) => Some(Value::Num(value.value)),
            K::Bool(value) => Some(Value::Bool(value)),
            K::Ident(ident) => self.resolve(ident.name.as_str()),
            K::Object(object) => {
                let resolver = |key: &str| self.resolve(key);
                let evaluator = Evaluator::with_resolver(env, &resolver);
                let evaluator = match self.imports {
                    Some(imports) => evaluator.importing(imports),
                    None => evaluator,
                };
                evaluator
                    .object(object)
                    .ok()
                    .map(Value::obj)
            }
            K::Binary(..) | K::Template(_) | K::Unary(_) => {
                let evaluator = Evaluator::new(env);
                let evaluator = match self.imports {
                    Some(imports) => evaluator.importing(imports),
                    None => evaluator,
                };
                evaluator.expression(init).ok()
            }
            _ => None,
        };
        self.visiting.borrow_mut().remove(name);
        if let Some(value) = &result {
            self.values.borrow_mut().insert(name, value.clone());
        }
        result
    }
}

pub fn collect_local_consts(program: &Program, imports: Option<&dyn Imports>) -> Object {
    let consts = Consts {
        decls: collect_local_const_nodes(program),
        values: RefCell::new(Object::new()),
        visiting: RefCell::new(FxHashSet::default()),
        imports,
    };
    let names: Vec<&str> = consts.decls.keys().copied().collect();
    for name in names {
        consts.resolve(name);
    }
    consts.values.into_inner()
}
