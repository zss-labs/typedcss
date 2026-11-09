// The names a module reads at runtime: what is left once its css.* calls are
// compiled away. A definition whose CSS is emitted only where it is used, such
// as css.keyframes, counts such a read as a use, alongside the CSS that names it.

use rustc_hash::FxHashSet;
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

use crate::oxc::elide::{arrow_names, function_names, stmt_names};

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

    fn read(&mut self, ident: &IdentifierReference, member: Option<String>) {
        if !self.shadowed(&ident.name) {
            self.found.push(Read {
                local: ident.name.to_string(),
                member,
            });
        }
    }
}

fn member_name(member: &MemberExpression) -> Option<String> {
    match member {
        MemberExpression::StaticMemberExpression(member) => Some(member.property.name.to_string()),
        MemberExpression::ComputedMemberExpression(member) => match &member.expression {
            Expression::StringLiteral(value) => Some(crate::oxc::syntax::expr::str_value(value)),
            Expression::NumericLiteral(number) => Some(crate::js::number::number_to_string(number.value)),
            _ => None,
        },
        MemberExpression::PrivateFieldExpression(_) => None,
    }
}

impl<'a> Visit<'a> for Reads<'_> {
    fn visit_import_declaration(&mut self, _: &ImportDeclaration<'a>) {}

    fn visit_expression(&mut self, expr: &Expression<'a>) {
        let span = expr.span();
        if self.skipped.contains(&(span.start, span.end)) {
            return;
        }
        if let Expression::Identifier(ident) = expr {
            self.read(ident, None);
            return;
        }
        if let Some(member) = expr.as_member_expression()
            && let Expression::Identifier(object) = member.object()
        {
            self.read(object, member_name(member));
            if let MemberExpression::ComputedMemberExpression(computed) = member {
                self.visit_expression(&computed.expression);
            }
            return;
        }
        walk::walk_expression(self, expr);
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

/// The runtime reads of `program`, leaving out the expressions whose spans are
/// in `skipped`, which are the initializers the build compiles away.
pub fn runtime_reads(program: &Program, skipped: &FxHashSet<(u32, u32)>) -> Vec<Read> {
    let mut reads = Reads {
        skipped,
        scopes: Vec::new(),
        found: Vec::new(),
    };
    reads.visit_program(program);
    reads.found
}
