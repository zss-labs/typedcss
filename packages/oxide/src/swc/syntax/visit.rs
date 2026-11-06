use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitWith};

pub struct AnyIdentifier<'f> {
    pub test: &'f dyn Fn(&str) -> bool,
    pub found: bool,
}

impl Visit for AnyIdentifier<'_> {
    fn visit_ident(&mut self, it: &Ident) {
        if !self.found && (self.test)(it.sym.as_str()) {
            self.found = true;
        }
    }

    fn visit_ident_name(&mut self, it: &IdentName) {
        if !self.found && (self.test)(it.sym.as_str()) {
            self.found = true;
        }
    }
}

pub fn expression_has_identifier(expr: &Expr, test: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = AnyIdentifier { test, found: false };
    expr.visit_with(&mut visitor);
    visitor.found
}

pub struct ReadsNames<'f> {
    pub names: &'f dyn Fn(&str) -> bool,
    pub found: bool,
}

impl Visit for ReadsNames<'_> {
    fn visit_ident(&mut self, it: &Ident) {
        if (self.names)(it.sym.as_str()) {
            self.found = true;
        }
    }

    fn visit_prop_name(&mut self, _it: &PropName) {}

    fn visit_jsx_element_name(&mut self, it: &JSXElementName) {
        match it {
            JSXElementName::Ident(ident) if ident.sym.starts_with(char::is_lowercase) => {}
            other => other.visit_children_with(self),
        }
    }

    fn visit_member_prop(&mut self, it: &MemberProp) {
        if let MemberProp::Computed(computed) = it {
            computed.visit_with(self);
        }
    }

    fn visit_ts_type_ann(&mut self, _it: &TsTypeAnn) {}

    fn visit_ts_type_param_instantiation(&mut self, _it: &TsTypeParamInstantiation) {}

    fn visit_ts_type_param_decl(&mut self, _it: &TsTypeParamDecl) {}
}

pub fn reads_names_expr(expr: &Expr, names: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = ReadsNames {
        names,
        found: false,
    };
    expr.visit_with(&mut visitor);
    visitor.found
}

pub fn reads_names_property(prop: &PropOrSpread, names: &dyn Fn(&str) -> bool) -> bool {
    let mut visitor = ReadsNames {
        names,
        found: false,
    };
    prop.visit_with(&mut visitor);
    visitor.found
}

#[cfg(test)]
pub fn jsx_openings(module: &Module) -> Vec<&JSXOpeningElement> {
    struct Collect {
        found: Vec<*const JSXOpeningElement>,
    }
    impl Visit for Collect {
        fn visit_jsx_opening_element(&mut self, it: &JSXOpeningElement) {
            self.found.push(it as *const _);
            it.visit_children_with(self);
        }
    }
    let mut collect = Collect { found: Vec::new() };
    module.visit_with(&mut collect);
    collect
        .found
        .into_iter()
        .map(|ptr| unsafe { &*ptr })
        .collect()
}
