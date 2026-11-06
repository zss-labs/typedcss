use swc_core::common::{Span, Spanned};
use swc_core::ecma::ast::*;

#[derive(Clone, Copy)]
pub struct E<'b> {
    node: Node<'b>,
    deep: bool,
}

#[derive(Clone, Copy)]
enum Node<'b> {
    Expr(&'b Expr),
    Member(&'b MemberExpr),
    Call(Call<'b>),
}

#[derive(Clone, Copy)]
pub struct Call<'b> {
    pub span: Span,
    pub callee: Option<&'b Expr>,
    pub args: &'b [ExprOrSpread],
}

impl<'b> Call<'b> {
    pub fn of(call: &'b CallExpr) -> Self {
        Call {
            span: call.span,
            callee: match &call.callee {
                Callee::Expr(callee) => Some(callee),
                _ => None,
            },
            args: &call.args,
        }
    }

    #[cfg(test)]
    pub fn has_spread(&self) -> bool {
        self.args.iter().any(|arg| arg.spread.is_some())
    }

    pub fn arg(&self, index: usize) -> Option<E<'b>> {
        self.args.get(index).map(|arg| E::new(&arg.expr))
    }
}

#[derive(Clone, Copy)]
pub enum Prop<'b> {
    Name(&'b str),
    Computed(E<'b>),
    Private,
}

#[derive(Clone, Copy)]
pub struct BinOp(pub BinaryOp);

impl BinOp {
    #[cfg(test)]
    pub fn is_and(self) -> bool {
        self.0 == BinaryOp::LogicalAnd
    }

    pub fn is_logical(self) -> bool {
        matches!(
            self.0,
            BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing
        )
    }
}

#[derive(Clone, Copy)]
pub enum K<'b> {
    Str(&'b Str),
    Num(&'b Number),
    Bool(bool),
    Null,
    Template(&'b Tpl),
    Ident(&'b Ident),
    Member(&'b MemberExpr),
    Call(Call<'b>),
    Object(&'b ObjectLit),
    Array,
    Conditional,
    Binary(E<'b>, BinOp, E<'b>),
    Unary(&'b UnaryExpr),
    Paren(&'b ParenExpr),
    Arrow,
    Function,
    Wrapper(E<'b>),
    Chain(&'b OptChainExpr),
    Other,
}

pub fn str_value(value: &Str) -> String {
    value.value.to_string_lossy().into_owned()
}

impl<'b> E<'b> {
    pub fn new(expr: &'b Expr) -> Self {
        E {
            node: Node::Expr(expr),
            deep: false,
        }
    }

    pub fn expr(&self) -> Option<&'b Expr> {
        match self.node {
            Node::Expr(expr) => Some(expr),
            _ => None,
        }
    }

    pub fn span(&self) -> Span {
        match self.node {
            Node::Expr(expr) => expr.span(),
            Node::Member(member) => member.span,
            Node::Call(call) => call.span,
        }
    }

    pub fn kind(&self) -> K<'b> {
        let child = |expr: &'b Expr| E::new(expr);
        match self.node {
            Node::Member(member) => K::Member(member),
            Node::Call(call) => K::Call(call),
            Node::Expr(expr) => match expr {
                Expr::Lit(Lit::Str(value)) => K::Str(value),
                Expr::Lit(Lit::Num(value)) => K::Num(value),
                Expr::Lit(Lit::Bool(value)) => K::Bool(value.value),
                Expr::Lit(Lit::Null(_)) => K::Null,
                Expr::Tpl(value) => K::Template(value),
                Expr::Ident(ident) => K::Ident(ident),
                Expr::Member(member) => K::Member(member),
                Expr::Call(call) => K::Call(Call::of(call)),
                Expr::Object(object) => K::Object(object),
                Expr::Array(_) => K::Array,
                Expr::Cond(_) => K::Conditional,
                Expr::Bin(binary) => {
                    K::Binary(child(&binary.left), BinOp(binary.op), child(&binary.right))
                }
                Expr::Unary(unary) => K::Unary(unary),
                Expr::Paren(paren) => K::Paren(paren),
                Expr::Arrow(_) => K::Arrow,
                Expr::Fn(_) => K::Function,
                Expr::TsAs(inner) => K::Wrapper(child(&inner.expr)),
                Expr::TsSatisfies(inner) => K::Wrapper(child(&inner.expr)),
                Expr::TsNonNull(inner) => K::Wrapper(child(&inner.expr)),
                Expr::TsTypeAssertion(inner) => K::Wrapper(child(&inner.expr)),
                Expr::TsConstAssertion(inner) => K::Wrapper(child(&inner.expr)),
                Expr::OptChain(chain) => K::Chain(chain),
                _ => K::Other,
            },
        }
    }

    pub fn member_object(&self, member: &'b MemberExpr) -> E<'b> {
        let raw = E::new(&member.obj);
        if self.deep { unwrap(raw) } else { raw }
    }

    pub fn ident(&self) -> Option<&'b Ident> {
        match self.kind() {
            K::Ident(ident) => Some(ident),
            _ => None,
        }
    }

    pub fn ident_name(&self) -> Option<&'b str> {
        self.ident().map(|ident| ident.sym.as_str())
    }

    pub fn is_member(&self) -> bool {
        matches!(self.kind(), K::Member(_))
    }

    pub fn member(&self) -> Option<&'b MemberExpr> {
        match self.kind() {
            K::Member(member) => Some(member),
            _ => None,
        }
    }

    pub fn object(&self) -> Option<E<'b>> {
        self.member().map(|member| self.member_object(member))
    }

    pub fn prop(&self) -> Option<Prop<'b>> {
        self.member().map(member_prop)
    }

    pub fn call(&self) -> Option<Call<'b>> {
        match self.kind() {
            K::Call(call) => Some(call),
            _ => None,
        }
    }

    pub fn is_undefined_ident(&self) -> bool {
        self.ident_name() == Some("undefined")
    }

}

pub fn member_prop(member: &MemberExpr) -> Prop<'_> {
    match &member.prop {
        MemberProp::Ident(name) => Prop::Name(name.sym.as_str()),
        MemberProp::Computed(computed) => Prop::Computed(E::new(&computed.expr)),
        MemberProp::PrivateName(_) => Prop::Private,
    }
}

fn chain_node(chain: &OptChainExpr) -> Node<'_> {
    match &*chain.base {
        OptChainBase::Member(member) => Node::Member(member),
        OptChainBase::Call(call) => Node::Call(Call {
            span: call.span,
            callee: Some(&call.callee),
            args: &call.args,
        }),
    }
}

pub fn unwrap(e: E<'_>) -> E<'_> {
    let mut current = e;
    loop {
        match current.kind() {
            K::Paren(paren) => current = E::new(&paren.expr),
            K::Wrapper(inner) => current = inner,
            K::Chain(chain) => {
                current = E {
                    node: chain_node(chain),
                    deep: false,
                };
            }
            K::Member(_) => {
                return E {
                    node: current.node,
                    deep: true,
                };
            }
            _ => return current,
        }
    }
}

pub fn root_identifier(e: E<'_>) -> Option<&str> {
    let e = unwrap(e);
    match e.kind() {
        K::Ident(ident) => Some(ident.sym.as_str()),
        K::Member(member) => root_identifier(e.member_object(member)),
        K::Call(call) => root_identifier(E::new(call.callee?)),
        _ => None,
    }
}

pub fn expression_label(e: E) -> String {
    let e = unwrap(e);
    match e.kind() {
        K::Ident(ident) => ident.sym.to_string(),
        K::Str(value) => format!("'{}'", str_value(value)),
        K::Num(value) => crate::js::number::number_to_string(value.value),
        K::Member(member) => {
            let object = expression_label(e.member_object(member));
            match member_prop(member) {
                Prop::Name(name) => format!("{object}.{name}"),
                Prop::Computed(inner) => format!("{object}[{}]", expression_label(inner)),
                Prop::Private => "an expression".to_string(),
            }
        }
        K::Null => "null".to_string(),
        K::Object(_) => "an object literal".to_string(),
        K::Array => "an array literal".to_string(),
        K::Call(_) => "a function call".to_string(),
        K::Conditional => "a conditional expression".to_string(),
        K::Arrow | K::Function => "a function".to_string(),
        _ => match e.expr() {
            Some(Expr::New(_)) => "a new expression".to_string(),
            Some(Expr::TaggedTpl(_)) => "a tagged template".to_string(),
            Some(Expr::Await(_)) => "an await expression".to_string(),
            _ => "an expression".to_string(),
        },
    }
}

pub fn swc_type_name(expr: &Expr) -> &'static str {
    match expr {
        Expr::Lit(Lit::Bool(_)) => "BooleanLiteral",
        Expr::Lit(Lit::Null(_)) => "NullLiteral",
        Expr::Lit(Lit::Num(_)) => "NumericLiteral",
        Expr::Lit(Lit::BigInt(_)) => "BigIntLiteral",
        Expr::Lit(Lit::Regex(_)) => "RegExpLiteral",
        Expr::Lit(Lit::Str(_)) => "StringLiteral",
        Expr::Tpl(_) => "TemplateLiteral",
        Expr::Ident(_) => "Identifier",
        Expr::SuperProp(_) => "Super",
        Expr::Array(_) => "ArrayExpression",
        Expr::Arrow(_) => "ArrowFunctionExpression",
        Expr::Assign(_) => "AssignmentExpression",
        Expr::Await(_) => "AwaitExpression",
        Expr::Bin(_) => "BinaryExpression",
        Expr::Call(_) => "CallExpression",
        Expr::OptChain(_) => "OptionalChainingExpression",
        Expr::Class(_) => "ClassExpression",
        Expr::Cond(_) => "ConditionalExpression",
        Expr::Fn(_) => "FunctionExpression",
        Expr::New(_) => "NewExpression",
        Expr::Object(_) => "ObjectExpression",
        Expr::Paren(_) => "ParenthesisExpression",
        Expr::Seq(_) => "SequenceExpression",
        Expr::TaggedTpl(_) => "TaggedTemplateExpression",
        Expr::This(_) => "ThisExpression",
        Expr::Unary(_) => "UnaryExpression",
        Expr::Update(_) => "UpdateExpression",
        Expr::Yield(_) => "YieldExpression",
        Expr::JSXElement(_) => "JSXElement",
        Expr::JSXFragment(_) => "JSXFragment",
        Expr::TsAs(_) => "TsAsExpression",
        Expr::TsSatisfies(_) => "TsSatisfiesExpression",
        Expr::TsTypeAssertion(_) => "TsTypeAssertion",
        Expr::TsNonNull(_) => "TsNonNullExpression",
        Expr::TsInstantiation(_) => "TsInstantiation",
        Expr::Member(_) => "MemberExpression",
        _ => "Expression",
    }
}
