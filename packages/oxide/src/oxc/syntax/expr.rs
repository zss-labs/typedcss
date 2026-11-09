use oxc_ast::ast::*;
use oxc_span::{GetSpan, Span};
use oxc_syntax::operator::{BinaryOperator, LogicalOperator, UnaryOperator};

#[derive(Clone, Copy)]
pub struct E<'b> {
    node: Node<'b>,
    deep: bool,
}

#[derive(Clone, Copy)]
enum Node<'b> {
    Expr(&'b Expression<'b>),
    Member(&'b MemberExpression<'b>),
    Call(Call<'b>),
    Ident(&'b IdentifierReference<'b>),
}

#[derive(Clone, Copy)]
pub struct Call<'b> {
    pub span: Span,
    pub callee: Option<&'b Expression<'b>>,
    pub args: &'b [Argument<'b>],
}

pub fn argument_expression<'b>(argument: &'b Argument<'b>) -> &'b Expression<'b> {
    match argument {
        Argument::SpreadElement(spread) => &spread.argument,
        other => other.to_expression(),
    }
}

impl<'b> Call<'b> {
    pub fn of(call: &'b CallExpression<'b>) -> Self {
        Call {
            span: call.span,
            callee: match &call.callee {
                Expression::Super(_) => None,
                callee => Some(callee),
            },
            args: &call.arguments,
        }
    }

    #[cfg(test)]
    pub fn has_spread(&self) -> bool {
        self.args.iter().any(|arg| matches!(arg, Argument::SpreadElement(_)))
    }

    pub fn arg(&self, index: usize) -> Option<E<'b>> {
        self.args.get(index).map(|arg| E::new(argument_expression(arg)))
    }
}

#[derive(Clone, Copy)]
pub enum Prop<'b> {
    Name(&'b str),
    Computed(E<'b>),
    Private,
}

/// A binary or logical operator, named as the evaluator reads it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinaryOp {
    EqEq,
    NotEq,
    EqEqEq,
    NotEqEq,
    Lt,
    LtEq,
    Gt,
    GtEq,
    LShift,
    RShift,
    ZeroFillRShift,
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    BitOr,
    BitXor,
    BitAnd,
    In,
    InstanceOf,
    Exp,
    LogicalOr,
    LogicalAnd,
    NullishCoalescing,
}

impl BinaryOp {
    pub fn of(operator: BinaryOperator) -> Self {
        match operator {
            BinaryOperator::Equality => BinaryOp::EqEq,
            BinaryOperator::Inequality => BinaryOp::NotEq,
            BinaryOperator::StrictEquality => BinaryOp::EqEqEq,
            BinaryOperator::StrictInequality => BinaryOp::NotEqEq,
            BinaryOperator::LessThan => BinaryOp::Lt,
            BinaryOperator::LessEqualThan => BinaryOp::LtEq,
            BinaryOperator::GreaterThan => BinaryOp::Gt,
            BinaryOperator::GreaterEqualThan => BinaryOp::GtEq,
            BinaryOperator::ShiftLeft => BinaryOp::LShift,
            BinaryOperator::ShiftRight => BinaryOp::RShift,
            BinaryOperator::ShiftRightZeroFill => BinaryOp::ZeroFillRShift,
            BinaryOperator::Addition => BinaryOp::Add,
            BinaryOperator::Subtraction => BinaryOp::Sub,
            BinaryOperator::Multiplication => BinaryOp::Mul,
            BinaryOperator::Division => BinaryOp::Div,
            BinaryOperator::Remainder => BinaryOp::Mod,
            BinaryOperator::BitwiseOR => BinaryOp::BitOr,
            BinaryOperator::BitwiseXOR => BinaryOp::BitXor,
            BinaryOperator::BitwiseAnd => BinaryOp::BitAnd,
            BinaryOperator::In => BinaryOp::In,
            BinaryOperator::Instanceof => BinaryOp::InstanceOf,
            BinaryOperator::Exponential => BinaryOp::Exp,
        }
    }

    pub fn of_logical(operator: LogicalOperator) -> Self {
        match operator {
            LogicalOperator::Or => BinaryOp::LogicalOr,
            LogicalOperator::And => BinaryOp::LogicalAnd,
            LogicalOperator::Coalesce => BinaryOp::NullishCoalescing,
        }
    }

    /// The operator as oxc builds it: a binary operator, or a logical one.
    pub fn operator(self) -> Result<BinaryOperator, LogicalOperator> {
        Ok(match self {
            BinaryOp::EqEq => BinaryOperator::Equality,
            BinaryOp::NotEq => BinaryOperator::Inequality,
            BinaryOp::EqEqEq => BinaryOperator::StrictEquality,
            BinaryOp::NotEqEq => BinaryOperator::StrictInequality,
            BinaryOp::Lt => BinaryOperator::LessThan,
            BinaryOp::LtEq => BinaryOperator::LessEqualThan,
            BinaryOp::Gt => BinaryOperator::GreaterThan,
            BinaryOp::GtEq => BinaryOperator::GreaterEqualThan,
            BinaryOp::LShift => BinaryOperator::ShiftLeft,
            BinaryOp::RShift => BinaryOperator::ShiftRight,
            BinaryOp::ZeroFillRShift => BinaryOperator::ShiftRightZeroFill,
            BinaryOp::Add => BinaryOperator::Addition,
            BinaryOp::Sub => BinaryOperator::Subtraction,
            BinaryOp::Mul => BinaryOperator::Multiplication,
            BinaryOp::Div => BinaryOperator::Division,
            BinaryOp::Mod => BinaryOperator::Remainder,
            BinaryOp::BitOr => BinaryOperator::BitwiseOR,
            BinaryOp::BitXor => BinaryOperator::BitwiseXOR,
            BinaryOp::BitAnd => BinaryOperator::BitwiseAnd,
            BinaryOp::In => BinaryOperator::In,
            BinaryOp::InstanceOf => BinaryOperator::Instanceof,
            BinaryOp::Exp => BinaryOperator::Exponential,
            BinaryOp::LogicalOr => return Err(LogicalOperator::Or),
            BinaryOp::LogicalAnd => return Err(LogicalOperator::And),
            BinaryOp::NullishCoalescing => return Err(LogicalOperator::Coalesce),
        })
    }

    pub fn as_str(self) -> &'static str {
        match self.operator() {
            Ok(operator) => operator.as_str(),
            Err(operator) => operator.as_str(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnaryOp {
    Minus,
    Plus,
    Bang,
    Tilde,
    TypeOf,
    Void,
    Delete,
}

impl UnaryOp {
    pub fn of(operator: UnaryOperator) -> Self {
        match operator {
            UnaryOperator::UnaryNegation => UnaryOp::Minus,
            UnaryOperator::UnaryPlus => UnaryOp::Plus,
            UnaryOperator::LogicalNot => UnaryOp::Bang,
            UnaryOperator::BitwiseNot => UnaryOp::Tilde,
            UnaryOperator::Typeof => UnaryOp::TypeOf,
            UnaryOperator::Void => UnaryOp::Void,
            UnaryOperator::Delete => UnaryOp::Delete,
        }
    }

    pub fn operator(self) -> UnaryOperator {
        match self {
            UnaryOp::Minus => UnaryOperator::UnaryNegation,
            UnaryOp::Plus => UnaryOperator::UnaryPlus,
            UnaryOp::Bang => UnaryOperator::LogicalNot,
            UnaryOp::Tilde => UnaryOperator::BitwiseNot,
            UnaryOp::TypeOf => UnaryOperator::Typeof,
            UnaryOp::Void => UnaryOperator::Void,
            UnaryOp::Delete => UnaryOperator::Delete,
        }
    }

    pub fn as_str(self) -> &'static str {
        self.operator().as_str()
    }
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
pub struct Unary<'b> {
    pub op: UnaryOp,
    pub arg: &'b Expression<'b>,
}

#[derive(Clone, Copy)]
pub enum K<'b> {
    Str(&'b StringLiteral<'b>),
    Num(&'b NumericLiteral<'b>),
    Bool(bool),
    Null,
    Template(&'b TemplateLiteral<'b>),
    Ident(&'b IdentifierReference<'b>),
    Member(&'b MemberExpression<'b>),
    Call(Call<'b>),
    Object(&'b ObjectExpression<'b>),
    Array,
    Conditional,
    Binary(E<'b>, BinOp, E<'b>),
    Unary(Unary<'b>),
    Paren(&'b Expression<'b>),
    Arrow,
    Function,
    Wrapper(E<'b>),
    Chain(&'b ChainExpression<'b>),
    Other,
}

pub fn str_value(value: &StringLiteral) -> String {
    value.value.display().to_string()
}

/// A property key as it is written: a name, a quoted string or a number, or
/// `[expression]`, which oxc keeps as the expression with `computed` set.
#[derive(Clone, Copy)]
pub enum Key<'b> {
    Ident(&'b str),
    Str(&'b StringLiteral<'b>),
    Num(f64),
    Computed(&'b Expression<'b>),
    Other,
}

pub fn property_key<'b>(key: &'b PropertyKey<'b>, computed: bool) -> Key<'b> {
    if computed {
        return match key.as_expression() {
            Some(expr) => Key::Computed(expr),
            None => Key::Other,
        };
    }
    match key {
        PropertyKey::StaticIdentifier(ident) => Key::Ident(ident.name.as_str()),
        PropertyKey::StringLiteral(value) => Key::Str(value),
        PropertyKey::NumericLiteral(value) => Key::Num(value.value),
        _ => Key::Other,
    }
}

impl<'b> Key<'b> {
    pub fn of(prop: &'b ObjectProperty<'b>) -> Self {
        property_key(&prop.key, prop.computed)
    }

    pub fn of_binding(prop: &'b BindingProperty<'b>) -> Self {
        property_key(&prop.key, prop.computed)
    }

    /// The key's name, for a key written as a name or a quoted string.
    pub fn name(self) -> Option<String> {
        match self {
            Key::Ident(name) => Some(name.to_string()),
            Key::Str(value) => Some(str_value(value)),
            _ => None,
        }
    }
}

/// `key: value`, leaving out shorthands, methods and accessors.
pub fn as_key_value<'b>(prop: &'b ObjectPropertyKind<'b>) -> Option<&'b ObjectProperty<'b>> {
    match prop {
        ObjectPropertyKind::ObjectProperty(prop)
            if prop.kind == PropertyKind::Init && !prop.method && !prop.shorthand =>
        {
            Some(prop)
        }
        _ => None,
    }
}

/// `{ name }`, read as the reference it holds.
pub fn as_shorthand<'b>(prop: &'b ObjectPropertyKind<'b>) -> Option<&'b IdentifierReference<'b>> {
    match prop {
        ObjectPropertyKind::ObjectProperty(prop) if prop.shorthand => match &prop.value {
            Expression::Identifier(ident) => Some(ident),
            _ => None,
        },
        _ => None,
    }
}

impl<'b> E<'b> {
    pub fn new(expr: &'b Expression<'b>) -> Self {
        E {
            node: Node::Expr(expr),
            deep: false,
        }
    }

    /// A shorthand property's value, which oxc keeps as a bare reference.
    pub fn ident(ident: &'b IdentifierReference<'b>) -> Self {
        E {
            node: Node::Ident(ident),
            deep: false,
        }
    }

    pub fn expr(&self) -> Option<&'b Expression<'b>> {
        match self.node {
            Node::Expr(expr) => Some(expr),
            _ => None,
        }
    }

    pub fn span(&self) -> Span {
        match self.node {
            Node::Expr(expr) => expr.span(),
            Node::Member(member) => member.span(),
            Node::Call(call) => call.span,
            Node::Ident(ident) => ident.span,
        }
    }

    pub fn kind(&self) -> K<'b> {
        let child = |expr: &'b Expression<'b>| E::new(expr);
        match self.node {
            Node::Member(member) => K::Member(member),
            Node::Call(call) => K::Call(call),
            Node::Ident(ident) => K::Ident(ident),
            Node::Expr(expr) => {
                if let Some(member) = expr.as_member_expression() {
                    return K::Member(member);
                }
                match expr {
                    Expression::StringLiteral(value) => K::Str(value),
                    Expression::NumericLiteral(value) => K::Num(value),
                    Expression::BooleanLiteral(value) => K::Bool(value.value),
                    Expression::NullLiteral(_) => K::Null,
                    Expression::TemplateLiteral(value) => K::Template(value),
                    Expression::Identifier(ident) => K::Ident(ident),
                    Expression::CallExpression(call) => K::Call(Call::of(call)),
                    Expression::ObjectExpression(object) => K::Object(object),
                    Expression::ArrayExpression(_) => K::Array,
                    Expression::ConditionalExpression(_) => K::Conditional,
                    Expression::BinaryExpression(binary) => K::Binary(
                        child(&binary.left),
                        BinOp(BinaryOp::of(binary.operator)),
                        child(&binary.right),
                    ),
                    Expression::LogicalExpression(logical) => K::Binary(
                        child(&logical.left),
                        BinOp(BinaryOp::of_logical(logical.operator)),
                        child(&logical.right),
                    ),
                    Expression::UnaryExpression(unary) => K::Unary(Unary {
                        op: UnaryOp::of(unary.operator),
                        arg: &unary.argument,
                    }),
                    Expression::ParenthesizedExpression(paren) => K::Paren(&paren.expression),
                    Expression::ArrowFunctionExpression(_) => K::Arrow,
                    Expression::FunctionExpression(_) => K::Function,
                    Expression::TSAsExpression(inner) => K::Wrapper(child(&inner.expression)),
                    Expression::TSSatisfiesExpression(inner) => K::Wrapper(child(&inner.expression)),
                    Expression::TSNonNullExpression(inner) => K::Wrapper(child(&inner.expression)),
                    Expression::TSTypeAssertion(inner) => K::Wrapper(child(&inner.expression)),
                    Expression::ChainExpression(chain) => K::Chain(chain),
                    _ => K::Other,
                }
            }
        }
    }

    pub fn member_object(&self, member: &'b MemberExpression<'b>) -> E<'b> {
        let raw = E::new(member.object());
        if self.deep { unwrap(raw) } else { raw }
    }

    pub fn ident_ref(&self) -> Option<&'b IdentifierReference<'b>> {
        match self.kind() {
            K::Ident(ident) => Some(ident),
            _ => None,
        }
    }

    pub fn ident_name(&self) -> Option<&'b str> {
        self.ident_ref().map(|ident| ident.name.as_str())
    }

    pub fn is_member(&self) -> bool {
        matches!(self.kind(), K::Member(_))
    }

    pub fn member(&self) -> Option<&'b MemberExpression<'b>> {
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

pub fn member_prop<'b>(member: &'b MemberExpression<'b>) -> Prop<'b> {
    match member {
        MemberExpression::StaticMemberExpression(member) => Prop::Name(member.property.name.as_str()),
        MemberExpression::ComputedMemberExpression(member) => Prop::Computed(E::new(&member.expression)),
        MemberExpression::PrivateFieldExpression(_) => Prop::Private,
    }
}

fn chain_node<'b>(chain: &'b ChainExpression<'b>) -> Node<'b> {
    match &chain.expression {
        ChainElement::CallExpression(call) => Node::Call(Call::of(call)),
        ChainElement::TSNonNullExpression(inner) => Node::Expr(&inner.expression),
        other => match other.as_member_expression() {
            Some(member) => Node::Member(member),
            None => unreachable!("a chain element is a call, a non-null assertion or a member"),
        },
    }
}

pub fn unwrap(e: E<'_>) -> E<'_> {
    let mut current = e;
    loop {
        match current.kind() {
            K::Paren(inner) => current = E::new(inner),
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
        K::Ident(ident) => Some(ident.name.as_str()),
        K::Member(member) => root_identifier(e.member_object(member)),
        K::Call(call) => root_identifier(E::new(call.callee?)),
        _ => None,
    }
}

pub fn expression_label(e: E) -> String {
    let e = unwrap(e);
    match e.kind() {
        K::Ident(ident) => ident.name.to_string(),
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
            Some(Expression::NewExpression(_)) => "a new expression".to_string(),
            Some(Expression::TaggedTemplateExpression(_)) => "a tagged template".to_string(),
            Some(Expression::AwaitExpression(_)) => "an await expression".to_string(),
            _ => "an expression".to_string(),
        },
    }
}

pub fn type_name(expr: &Expression) -> &'static str {
    if expr.is_member_expression() {
        return match expr {
            Expression::StaticMemberExpression(member) if matches!(member.object, Expression::Super(_)) => "Super",
            Expression::ComputedMemberExpression(member) if matches!(member.object, Expression::Super(_)) => "Super",
            _ => "MemberExpression",
        };
    }
    match expr {
        Expression::BooleanLiteral(_) => "BooleanLiteral",
        Expression::NullLiteral(_) => "NullLiteral",
        Expression::NumericLiteral(_) => "NumericLiteral",
        Expression::BigIntLiteral(_) => "BigIntLiteral",
        Expression::RegExpLiteral(_) => "RegExpLiteral",
        Expression::StringLiteral(_) => "StringLiteral",
        Expression::TemplateLiteral(_) => "TemplateLiteral",
        Expression::Identifier(_) => "Identifier",
        Expression::ArrayExpression(_) => "ArrayExpression",
        Expression::ArrowFunctionExpression(_) => "ArrowFunctionExpression",
        Expression::AssignmentExpression(_) => "AssignmentExpression",
        Expression::AwaitExpression(_) => "AwaitExpression",
        Expression::BinaryExpression(_) | Expression::LogicalExpression(_) | Expression::PrivateInExpression(_) => {
            "BinaryExpression"
        }
        Expression::CallExpression(_) => "CallExpression",
        Expression::ChainExpression(_) => "OptionalChainingExpression",
        Expression::ClassExpression(_) => "ClassExpression",
        Expression::ConditionalExpression(_) => "ConditionalExpression",
        Expression::FunctionExpression(_) => "FunctionExpression",
        Expression::NewExpression(_) => "NewExpression",
        Expression::ObjectExpression(_) => "ObjectExpression",
        Expression::ParenthesizedExpression(_) => "ParenthesisExpression",
        Expression::SequenceExpression(_) => "SequenceExpression",
        Expression::TaggedTemplateExpression(_) => "TaggedTemplateExpression",
        Expression::ThisExpression(_) => "ThisExpression",
        Expression::UnaryExpression(_) => "UnaryExpression",
        Expression::UpdateExpression(_) => "UpdateExpression",
        Expression::YieldExpression(_) => "YieldExpression",
        Expression::JSXElement(_) => "JSXElement",
        Expression::JSXFragment(_) => "JSXFragment",
        Expression::TSAsExpression(_) => "TsAsExpression",
        Expression::TSSatisfiesExpression(_) => "TsSatisfiesExpression",
        Expression::TSTypeAssertion(_) => "TsTypeAssertion",
        Expression::TSNonNullExpression(_) => "TsNonNullExpression",
        Expression::TSInstantiationExpression(_) => "TsInstantiation",
        _ => "Expression",
    }
}
