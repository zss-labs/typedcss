// The names a module reads at runtime: what is left once its css.* calls are
// compiled away. A definition whose CSS is emitted only where it is used, such
// as css.keyframes, counts such a read as a use, alongside the CSS that names it.

use rustc_hash::FxHashSet;
use swc_core::common::Spanned;
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitWith};

use crate::swc::elide::{pat_names, stmt_names};

/// A local name read at runtime, with the member read through it when the read
/// is `name.member` or `name['member']`.
pub struct Read {
    pub local: String,
    pub member: Option<String>,
}

struct Reads<'s> {
    skipped: &'s FxHashSet<(u32, u32)>,
    scopes: Vec<Vec<String>>,
    found: Vec<Read>,
}

impl Reads<'_> {
    fn scoped(&mut self, names: Vec<String>, visit: impl FnOnce(&mut Self)) {
        self.scopes.push(names);
        visit(self);
        self.scopes.pop();
    }

    fn shadowed(&self, name: &str) -> bool {
        self.scopes.iter().any(|scope| scope.iter().any(|n| n == name))
    }

    fn read(&mut self, ident: &Ident, member: Option<String>) {
        if !self.shadowed(&ident.sym) {
            self.found.push(Read {
                local: ident.sym.to_string(),
                member,
            });
        }
    }
}

fn member_name(prop: &MemberProp) -> Option<String> {
    match prop {
        MemberProp::Ident(ident) => Some(ident.sym.to_string()),
        MemberProp::Computed(computed) => match &*computed.expr {
            Expr::Lit(Lit::Str(value)) => Some(crate::swc::syntax::expr::str_value(value)),
            Expr::Lit(Lit::Num(number)) => Some(crate::js::number::number_to_string(number.value)),
            _ => None,
        },
        _ => None,
    }
}

impl Visit for Reads<'_> {
    fn visit_import_decl(&mut self, _: &ImportDecl) {}

    fn visit_expr(&mut self, expr: &Expr) {
        let span = expr.span();
        if self.skipped.contains(&(span.lo.0, span.hi.0)) {
            return;
        }
        match expr {
            Expr::Ident(ident) => self.read(ident, None),
            Expr::Member(member) => match &*member.obj {
                Expr::Ident(object) => {
                    self.read(object, member_name(&member.prop));
                    member.prop.visit_with(self);
                }
                _ => member.visit_children_with(self),
            },
            _ => expr.visit_children_with(self),
        }
    }

    fn visit_prop(&mut self, prop: &Prop) {
        match prop {
            Prop::Shorthand(ident) => self.read(ident, None),
            _ => prop.visit_children_with(self),
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

/// The runtime reads of `module`, leaving out the expressions whose spans are
/// in `skipped`, which are the initializers the build compiles away.
pub fn runtime_reads(module: &Module, skipped: &FxHashSet<(u32, u32)>) -> Vec<Read> {
    let mut reads = Reads {
        skipped,
        scopes: Vec::new(),
        found: Vec::new(),
    };
    module.visit_with(&mut reads);
    reads.found
}
