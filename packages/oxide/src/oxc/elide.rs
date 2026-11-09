use rustc_hash::FxHashSet;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_syntax::scope::ScopeFlags;

pub(crate) fn pat_names(pat: &BindingPattern, names: &mut Vec<String>) {
    match pat {
        BindingPattern::BindingIdentifier(binding) => names.push(binding.name.to_string()),
        BindingPattern::ArrayPattern(array) => {
            array.elements.iter().flatten().for_each(|p| pat_names(p, names));
            if let Some(rest) = &array.rest {
                pat_names(&rest.argument, names);
            }
        }
        BindingPattern::ObjectPattern(object) => {
            for prop in &object.properties {
                pat_names(&prop.value, names);
            }
            if let Some(rest) = &object.rest {
                pat_names(&rest.argument, names);
            }
        }
        BindingPattern::AssignmentPattern(assign) => pat_names(&assign.left, names),
    }
}

pub(crate) fn param_names(params: &FormalParameters, names: &mut Vec<String>) {
    params.items.iter().for_each(|p| pat_names(&p.pattern, names));
    if let Some(rest) = &params.rest {
        pat_names(&rest.rest.argument, names);
    }
}

pub(crate) fn stmt_names(stmts: &[Statement], names: &mut Vec<String>) {
    for stmt in stmts {
        match stmt {
            Statement::VariableDeclaration(var) => var.declarations.iter().for_each(|d| pat_names(&d.id, names)),
            Statement::FunctionDeclaration(f) => names.extend(f.id.as_ref().map(|id| id.name.to_string())),
            Statement::ClassDeclaration(c) => names.extend(c.id.as_ref().map(|id| id.name.to_string())),
            _ => {}
        }
    }
}

pub(crate) fn arrow_names(arrow: &ArrowFunctionExpression) -> Vec<String> {
    let mut names = Vec::new();
    param_names(&arrow.params, &mut names);
    if let ArrowFunctionBody::FunctionBody(block) = &arrow.body {
        stmt_names(&block.statements, &mut names);
    }
    names
}

pub(crate) fn function_names(function: &Function) -> Vec<String> {
    let mut names = Vec::new();
    param_names(&function.params, &mut names);
    if let Some(body) = &function.body {
        stmt_names(&body.statements, &mut names);
    }
    names
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

    fn name(&mut self, name: &str) {
        if !self.shadowed(name) {
            self.names.insert(name.to_string());
        }
    }
}

impl<'a> Visit<'a> for References {
    fn visit_import_declaration(&mut self, _: &ImportDeclaration<'a>) {}

    fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
        self.name(&ident.name);
    }

    fn visit_binding_identifier(&mut self, ident: &BindingIdentifier<'a>) {
        self.name(&ident.name);
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'a>) {
        self.scoped(arrow_names(arrow), |this| walk::walk_arrow_function_expression(this, arrow));
    }

    fn visit_function(&mut self, function: &Function<'a>, flags: ScopeFlags) {
        self.scoped(function_names(function), |this| walk::walk_function(this, function, flags));
    }

    fn visit_block_statement(&mut self, block: &BlockStatement<'a>) {
        let mut names = Vec::new();
        stmt_names(&block.body, &mut names);
        self.scoped(names, |this| walk::walk_block_statement(this, block));
    }
}

pub fn referenced(program: &Program) -> FxHashSet<String> {
    let mut references = References::default();
    references.visit_program(program);
    references.names
}

fn local<'b>(specifier: &'b ImportDeclarationSpecifier<'b>) -> &'b BindingIdentifier<'b> {
    match specifier {
        ImportDeclarationSpecifier::ImportSpecifier(named) => &named.local,
        ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => &default.local,
        ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => &namespace.local,
    }
}

pub fn elide_imports(program: &mut Program, before: &FxHashSet<String>, core: &str) {
    let after = referenced(program);
    program.body.retain(|item| {
        let Statement::ImportDeclaration(import) = item else {
            return true;
        };
        let Some(specifiers) = &import.specifiers else {
            return true;
        };
        if import.import_kind.is_type() || specifiers.is_empty() || import.source.value == core {
            return true;
        }
        specifiers.iter().any(|specifier| {
            let name = local(specifier).name.to_string();
            let type_only = matches!(specifier, ImportDeclarationSpecifier::ImportSpecifier(named) if named.import_kind.is_type());
            type_only || after.contains(&name) || !before.contains(&name)
        })
    });
}
