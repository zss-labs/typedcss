use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

pub struct AnyIdentifier<'f> {
    pub test: &'f dyn Fn(&str) -> bool,
    pub found: bool,
}

impl AnyIdentifier<'_> {
    fn check(&mut self, name: &str) {
        if !self.found && (self.test)(name) {
            self.found = true;
        }
    }
}

impl<'a> Visit<'a> for AnyIdentifier<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        self.check(it.name.as_str());
    }

    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        self.check(it.name.as_str());
    }

    fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
        self.check(it.name.as_str());
    }

    fn visit_jsx_identifier(&mut self, it: &JSXIdentifier<'a>) {
        self.check(it.name.as_str());
    }
}

pub fn expression_has_identifier(expr: &Expression, test: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = AnyIdentifier { test, found: false };
    visitor.visit_expression(expr);
    visitor.found
}

/// Whether a node reads one of `names`: the identifiers it references or
/// binds, leaving out property keys, member names, intrinsic JSX tags and types.
pub struct ReadsNames<'f> {
    pub names: &'f dyn Fn(&str) -> bool,
    pub found: bool,
}

impl<'a> Visit<'a> for ReadsNames<'_> {
    fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
        if (self.names)(it.name.as_str()) {
            self.found = true;
        }
    }

    fn visit_binding_identifier(&mut self, it: &BindingIdentifier<'a>) {
        if (self.names)(it.name.as_str()) {
            self.found = true;
        }
    }

    fn visit_property_key(&mut self, _it: &PropertyKey<'a>) {}

    fn visit_ts_type_annotation(&mut self, _it: &TSTypeAnnotation<'a>) {}

    fn visit_ts_type_parameter_instantiation(&mut self, _it: &TSTypeParameterInstantiation<'a>) {}

    fn visit_ts_type_parameter_declaration(&mut self, _it: &TSTypeParameterDeclaration<'a>) {}
}

pub fn reads_names_expr(expr: &Expression, names: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = ReadsNames {
        names,
        found: false,
    };
    visitor.visit_expression(expr);
    visitor.found
}

pub fn reads_names_property(prop: &ObjectPropertyKind, names: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = ReadsNames {
        names,
        found: false,
    };
    visitor.visit_object_property_kind(prop);
    visitor.found
}

#[cfg(test)]
pub fn jsx_openings<'b>(program: &'b Program<'b>) -> Vec<&'b JSXOpeningElement<'b>> {
    use oxc_ast_visit::walk::walk_jsx_opening_element;
    struct Collect<'b> {
        found: Vec<&'b JSXOpeningElement<'b>>,
    }
    impl<'b> Visit<'b> for Collect<'b> {
        fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement<'b>) {
            // SAFETY: every node visited lives as long as the program it is in.
            self.found.push(unsafe { &*(it as *const JSXOpeningElement<'b>) });
            walk_jsx_opening_element(self, it);
        }
    }
    let mut collect = Collect { found: Vec::new() };
    collect.visit_program(program);
    collect.found
}
