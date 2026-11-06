use rustc_hash::FxHashSet;
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitWith};

pub(crate) fn pat_names(pat: &Pat, names: &mut Vec<String>) {
    match pat {
        Pat::Ident(binding) => names.push(binding.id.sym.to_string()),
        Pat::Array(array) => array.elems.iter().flatten().for_each(|p| pat_names(p, names)),
        Pat::Object(object) => {
            for prop in &object.props {
                match prop {
                    ObjectPatProp::KeyValue(pair) => pat_names(&pair.value, names),
                    ObjectPatProp::Assign(assign) => names.push(assign.key.sym.to_string()),
                    ObjectPatProp::Rest(rest) => pat_names(&rest.arg, names),
                }
            }
        }
        Pat::Rest(rest) => pat_names(&rest.arg, names),
        Pat::Assign(assign) => pat_names(&assign.left, names),
        _ => {}
    }
}

pub(crate) fn stmt_names(stmts: &[Stmt], names: &mut Vec<String>) {
    for stmt in stmts {
        if let Stmt::Decl(decl) = stmt {
            match decl {
                Decl::Var(var) => var.decls.iter().for_each(|d| pat_names(&d.name, names)),
                Decl::Fn(f) => names.push(f.ident.sym.to_string()),
                Decl::Class(c) => names.push(c.ident.sym.to_string()),
                _ => {}
            }
        }
    }
}

#[derive(Default)]
struct References {
    scopes: Vec<Vec<String>>,
    names: FxHashSet<String>,
}

impl References {
    fn scoped(&mut self, names: Vec<String>, visit: impl FnOnce(&mut Self)) {
        self.scopes.push(names);
        visit(self);
        self.scopes.pop();
    }

    fn shadowed(&self, name: &str) -> bool {
        self.scopes.iter().any(|scope| scope.iter().any(|n| n == name))
    }
}

impl Visit for References {
    fn visit_import_decl(&mut self, _: &ImportDecl) {}

    fn visit_ident(&mut self, ident: &Ident) {
        if !self.shadowed(&ident.sym) {
            self.names.insert(ident.sym.to_string());
        }
    }

    fn visit_jsx_element_name(&mut self, name: &JSXElementName) {
        match name {
            JSXElementName::Ident(ident) if ident.sym.starts_with(|c: char| c.is_ascii_lowercase()) => {}
            _ => name.visit_children_with(self),
        }
    }

    fn visit_arrow_expr(&mut self, arrow: &ArrowExpr) {
        let mut names = Vec::new();
        arrow.params.iter().for_each(|p| pat_names(p, &mut names));
        if let ArrowFunctionBody::FunctionBody(block) = &*arrow.body {
            stmt_names(&block.stmts, &mut names);
        }
        self.scoped(names, |this| arrow.visit_children_with(this));
    }

    fn visit_function(&mut self, function: &Function) {
        let mut names = Vec::new();
        function.params.iter().for_each(|p| pat_names(&p.pat, &mut names));
        if let Some(body) = &function.body {
            stmt_names(&body.stmts, &mut names);
        }
        self.scoped(names, |this| function.visit_children_with(this));
    }

    fn visit_block_stmt(&mut self, block: &BlockStmt) {
        let mut names = Vec::new();
        stmt_names(&block.stmts, &mut names);
        self.scoped(names, |this| block.visit_children_with(this));
    }
}

pub fn referenced(module: &Module) -> FxHashSet<String> {
    let mut references = References::default();
    module.visit_with(&mut references);
    references.names
}

fn local(specifier: &ImportSpecifier) -> &Ident {
    match specifier {
        ImportSpecifier::Named(named) => &named.local,
        ImportSpecifier::Default(default) => &default.local,
        ImportSpecifier::Namespace(namespace) => &namespace.local,
    }
}

pub fn elide_imports(module: &mut Module, before: &FxHashSet<String>, core: &str) {
    let after = referenced(module);
    module.body.retain_mut(|item| {
        let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = item else {
            return true;
        };
        if import.type_only || import.specifiers.is_empty() || &*import.src.value == core {
            return true;
        }
        import.specifiers.iter().any(|specifier| {
            let name = local(specifier).sym.to_string();
            let type_only = matches!(specifier, ImportSpecifier::Named(named) if named.is_type_only);
            type_only || after.contains(&name) || !before.contains(&name)
        })
    });
}
