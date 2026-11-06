use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashSet};
use swc_core::ecma::ast::{
    ArrowFunctionBody, BinaryOp, Expr, ObjectLit, ObjectPatProp, Pat, Prop as AstProp, PropName,
    PropOrSpread, Stmt, UnaryOp,
};

use super::{Env, EvalResult, Evaluator, Layer, Lookup, Replacements, span_key};
use crate::engine::hash::hash_object;
use crate::js::{Object, Value};
use crate::style::units::{VarGroup, VarUnit, apply_var_fallback, split_var_by_unit};
use crate::swc::syntax::expr::{E, K, expression_label, unwrap};
use crate::swc::syntax::visit::{reads_names_expr, reads_names_property};

#[derive(Clone, Debug)]
pub struct NamedParam {
    pub key: String,
    pub local: String,
}

#[derive(Clone)]
pub struct StyleFunction<'b> {
    pub params: Vec<String>,
    pub unsupported_params: bool,
    pub named: Option<Vec<NamedParam>>,
    pub defaults: IndexMap<String, &'b Expr, FxBuildHasher>,
    pub body: &'b ObjectLit,
}

pub type StyleFunctions<'b> = IndexMap<String, StyleFunction<'b>, FxBuildHasher>;

pub struct ParamView<'b> {
    pub pattern: &'b Pat,
    pub initializer: Option<&'b Expr>,
    pub rest: bool,
}

pub fn param_view(pattern: &Pat) -> ParamView<'_> {
    match pattern {
        Pat::Assign(assign) => ParamView {
            pattern: &assign.left,
            initializer: Some(&assign.right),
            rest: false,
        },
        Pat::Rest(rest) => ParamView {
            pattern: &rest.arg,
            initializer: None,
            rest: true,
        },
        other => ParamView {
            pattern: other,
            initializer: None,
            rest: false,
        },
    }
}

fn named_params_of<'b>(
    params: &[ParamView<'b>],
    defaults: &mut IndexMap<String, &'b Expr, FxBuildHasher>,
) -> Option<Vec<NamedParam>> {
    if params.len() != 1 {
        return None;
    }
    let first = &params[0];
    if first.rest || first.initializer.is_some() {
        return None;
    }
    let Pat::Object(pattern) = first.pattern else {
        return None;
    };
    let mut named = Vec::new();
    for prop in &pattern.props {
        match prop {
            ObjectPatProp::Assign(assign) => {
                let key = assign.key.id.sym.to_string();
                named.push(NamedParam {
                    key: key.clone(),
                    local: key.clone(),
                });
                if let Some(value) = &assign.value {
                    defaults.insert(key, value);
                }
            }
            ObjectPatProp::KeyValue(pair) => {
                let PropName::Ident(key) = &pair.key else {
                    return None;
                };
                let key = key.sym.to_string();
                match &*pair.value {
                    Pat::Ident(local) => named.push(NamedParam {
                        key,
                        local: local.id.sym.to_string(),
                    }),
                    Pat::Assign(assign) => {
                        let Pat::Ident(local) = &*assign.left else {
                            return None;
                        };
                        let local = local.id.sym.to_string();
                        defaults.insert(local.clone(), &assign.right);
                        named.push(NamedParam { key, local });
                    }
                    _ => return None,
                }
            }
            _ => return None,
        }
    }
    if named.is_empty() { None } else { Some(named) }
}

#[derive(Clone, Copy)]
pub enum Body<'b> {
    Block(&'b [Stmt]),
    Expr(&'b Expr),
}

pub fn function_parts(value: &Expr) -> Option<(Vec<&Pat>, Body<'_>)> {
    match value {
        Expr::Arrow(arrow) => Some((
            arrow.params.iter().collect(),
            match &*arrow.body {
                ArrowFunctionBody::FunctionBody(block) => Body::Block(&block.stmts),
                ArrowFunctionBody::Expr(expr) => Body::Expr(expr),
            },
        )),
        Expr::Fn(function) => function.function.body.as_ref().map(|body| {
            (
                function.function.params.iter().map(|param| &param.pat).collect(),
                Body::Block(&body.stmts),
            )
        }),
        _ => None,
    }
}

pub fn returned_expression(body: Body<'_>) -> Option<&Expr> {
    match body {
        Body::Expr(expr) => Some(expr),
        Body::Block(stmts) => match stmts.first()? {
            Stmt::Return(statement) => statement.arg.as_deref(),
            _ => None,
        },
    }
}

fn strip_one_paren(expr: &Expr) -> &Expr {
    match expr {
        Expr::Paren(paren) => &paren.expr,
        other => other,
    }
}

pub fn style_function_body(value: &Expr) -> Option<&ObjectLit> {
    let (_, body) = function_parts(value)?;
    match strip_one_paren(returned_expression(body)?) {
        Expr::Object(object) => Some(object),
        _ => None,
    }
}

pub fn style_functions_of(object: &ObjectLit) -> StyleFunctions<'_> {
    let mut functions = StyleFunctions::default();
    for prop in &object.props {
        let PropOrSpread::Prop(prop) = prop else {
            continue;
        };
        let AstProp::KeyValue(prop) = &**prop else {
            continue;
        };
        let PropName::Ident(key) = &prop.key else {
            continue;
        };
        let Some((params, _)) = function_parts(&prop.value) else {
            continue;
        };
        let views: Vec<ParamView> = params.into_iter().map(param_view).collect();

        let mut defaults: IndexMap<String, &Expr, FxBuildHasher> = IndexMap::default();
        let names: Vec<String> = views
            .iter()
            .map(|view| {
                if view.rest {
                    return "arg".to_string();
                }
                match (view.pattern, view.initializer) {
                    (Pat::Ident(ident), None) => ident.id.sym.to_string(),
                    (Pat::Ident(ident), Some(right)) => {
                        defaults.insert(ident.id.sym.to_string(), right);
                        ident.id.sym.to_string()
                    }
                    _ => "arg".to_string(),
                }
            })
            .collect();

        let Some(body) = style_function_body(&prop.value) else {
            continue;
        };

        let unsupported = views.iter().any(|view| {
            if view.rest {
                return true;
            }
            if view.initializer.is_some() {
                return false;
            }
            match view.pattern {
                Pat::Array(_) => true,
                Pat::Object(_) => {
                    let mut scratch = IndexMap::default();
                    named_params_of(&views, &mut scratch).is_none()
                }
                _ => false,
            }
        });
        let named = named_params_of(&views, &mut defaults);

        functions.insert(
            key.sym.to_string(),
            StyleFunction {
                params: names,
                unsupported_params: unsupported,
                named,
                defaults,
                body,
            },
        );
    }
    functions
}

#[derive(Clone, Debug, PartialEq)]
pub enum Literal {
    Str(String),
    Num(f64),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Derived {
    Param(String, Option<Literal>),
    Literal(Literal),
    Binary(Box<Derived>, BinaryOp, Box<Derived>),
    Unary(UnaryOp, Box<Derived>),
}

impl Derived {
    pub fn first_param(&self) -> Option<&str> {
        match self {
            Derived::Param(name, _) => Some(name),
            Derived::Literal(_) => None,
            Derived::Binary(left, _, right) => left.first_param().or_else(|| right.first_param()),
            Derived::Unary(_, argument) => argument.first_param(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct DerivedVar {
    pub name: String,
    pub expr: Derived,
}

enum Replacement {
    Constant(f64),
    Derived(String),
}

fn default_error(param: &str, node: E, literal: Option<&Value>) -> String {
    let kind = match (node.kind(), literal) {
        (K::Null, _) | (_, Some(Value::Null)) => Some("null"),
        (_, Some(Value::Bool(_))) => Some("a boolean"),
        (_, Some(_)) => Some("an object"),
        _ => None,
    };
    match kind {
        Some(kind) => format!(
            "[typedcss] The default of \"{param}\" is {kind}, which a dynamic style function cannot fall back on. Use a string or a number, or pass the value from the call."
        ),
        None => format!(
            "[typedcss] Cannot resolve the default of \"{param}\" at build time ({}). A dynamic style function falls back on it when the argument is undefined, so it has to be a string or a number plumeria can read. Pass the value from the call instead.",
            expression_label(node)
        ),
    }
}

pub fn literal_value(value: &Value) -> Option<Literal> {
    match value {
        Value::Str(text) => Some(Literal::Str(text.to_string())),
        Value::Num(number) => Some(Literal::Num(*number)),
        _ => None,
    }
}

struct Deriver<'d> {
    runtime: &'d [String],
    vars: &'d [String],
    defaults: &'d IndexMap<String, Value, FxBuildHasher>,
    evaluate: &'d dyn Fn(E) -> Option<Value>,
    derived: Vec<DerivedVar>,
    replacements: Vec<((u32, u32), Replacement)>,
}

fn is_arithmetic(operator: BinaryOp) -> bool {
    matches!(
        operator,
        BinaryOp::Add | BinaryOp::Sub | BinaryOp::Mul | BinaryOp::Div | BinaryOp::Mod | BinaryOp::Exp
    )
}

fn is_sign(operator: UnaryOp) -> bool {
    matches!(operator, UnaryOp::Minus | UnaryOp::Plus)
}

fn reads(node: E, names: &[String]) -> bool {
    node.expr()
        .is_some_and(|expr| reads_names_expr(expr, &|name| names.iter().any(|param| param == name)))
}

impl Deriver<'_> {
    fn render(&self, expression: E) -> Option<Derived> {
        let node = unwrap(expression);
        match node.kind() {
            K::Ident(ident) if self.runtime.iter().any(|param| param == ident.sym.as_str()) => {
                let name = ident.sym.as_str();
                let fallback = self.defaults.get(name).and_then(literal_value);
                return Some(Derived::Param(name.to_string(), fallback));
            }
            K::Binary(left, op, right) if is_arithmetic(op.0) => {
                let left = self.render(left)?;
                let right = self.render(right)?;
                return Some(Derived::Binary(Box::new(left), op.0, Box::new(right)));
            }
            K::Unary(unary) if is_sign(unary.op) => {
                let argument = self.render(E::new(&unary.arg))?;
                return Some(Derived::Unary(unary.op, Box::new(argument)));
            }
            _ => {}
        }
        if reads(node, self.runtime) {
            return None;
        }
        match (self.evaluate)(node) {
            Some(value @ Value::Num(_)) => literal_value(&value).map(Derived::Literal),
            _ => None,
        }
    }

    fn register(&mut self, node: E, derived: Derived) {
        let key = span_key(node);
        let Some(first) = derived.first_param().map(str::to_string) else {
            if let Some(Value::Num(number)) = (self.evaluate)(node) {
                self.replacements.push((key, Replacement::Constant(number)));
            }
            return;
        };
        let name = match self.derived.iter().find(|entry| entry.expr == derived) {
            Some(entry) => entry.name.clone(),
            None => {
                let name = format!("{first}-{}", self.derived.len() + 1);
                self.derived.push(DerivedVar {
                    name: name.clone(),
                    expr: derived,
                });
                name
            }
        };
        self.replacements.push((key, Replacement::Derived(name)));
    }

    fn visit_object(&mut self, object: &ObjectLit) {
        for prop in &object.props {
            let PropOrSpread::Prop(prop) = prop else {
                continue;
            };
            let AstProp::KeyValue(prop) = &**prop else {
                continue;
            };
            self.visit(E::new(&prop.value));
        }
    }

    fn visit(&mut self, expression: E) {
        let node = unwrap(expression);
        let operands = match node.kind() {
            K::Object(object) => {
                self.visit_object(object);
                return;
            }
            K::Template(template) => {
                for expr in &template.exprs {
                    self.visit(E::new(expr));
                }
                return;
            }
            K::Binary(left, op, right) if is_arithmetic(op.0) => {
                (op.0 == BinaryOp::Add).then_some((left, right))
            }
            K::Unary(unary) if is_sign(unary.op) => None,
            _ => return,
        };
        if !reads(node, self.vars) {
            return;
        }
        if let Some(derived) = self.render(node) {
            self.register(node, derived);
            return;
        }
        if let Some((left, right)) = operands {
            self.visit(left);
            self.visit(right);
        }
    }
}

pub struct DynamicStyle {
    pub style: Object,
    pub var_groups: IndexMap<String, Vec<VarGroup>, FxBuildHasher>,
    pub derived: Vec<DerivedVar>,
}

fn attach_imports<'e, 'r>(
    evaluator: Evaluator<'e, 'r>,
    imports: Option<&'r dyn crate::swc::eval::Imports>,
) -> Evaluator<'e, 'r> {
    match imports {
        Some(imports) => evaluator.importing(imports),
        None => evaluator,
    }
}

pub fn resolve_dynamic_style(
    func: &StyleFunction,
    runtime_params: &[String],
    statics: &dyn Lookup<Value>,
    tables: Env,
    provided: Option<&FxHashSet<String>>,
    definite: &[String],
    imports: Option<&dyn crate::swc::eval::Imports>,
) -> EvalResult<DynamicStyle> {
    if func.unsupported_params {
        return Err(
            "[typedcss] Dynamic styles require named parameters or object destructuring; array and rest parameters are not supported."
                .to_string(),
        );
    }
    let mut temp: Layer<Value> = Layer::over(statics);

    let with_default: Vec<(String, &Expr)> = func
        .defaults
        .iter()
        .filter(|(param, _)| match provided {
            Some(provided) => !provided.contains(param.as_str()),
            None => temp.lookup(param).is_none(),
        })
        .map(|(param, expr)| (param.clone(), *expr))
        .collect();

    let mut default_literals: IndexMap<String, Value, FxBuildHasher> = IndexMap::default();
    for (param, expr) in &with_default {
        let node = unwrap(E::new(expr));
        if node.is_undefined_ident() {
            continue;
        }
        let is_definite = definite.contains(param)
            || !func
                .body
                .props
                .iter()
                .any(|prop| reads_names_property(prop, &|name| name == param.as_str()));
        let literal =
            match attach_imports(Evaluator::new(tables.with_statics(statics)), imports).property_value(E::new(expr)) {
                Ok(literal) => literal,
                Err(_) if is_definite => continue,
                Err(error) => return Err(error),
            };
        match literal {
            Some(literal @ (Value::Str(_) | Value::Num(_))) => {
                default_literals.insert(param.clone(), literal);
            }
            _ if is_definite => {}
            other => return Err(default_error(param, node, other.as_ref())),
        }
    }
    let hole_defaults: IndexMap<String, Value, FxBuildHasher> = default_literals
        .iter()
        .filter(|(param, _)| !definite.contains(*param))
        .map(|(param, literal)| (param.clone(), literal.clone()))
        .collect();

    let mut var_params: Vec<String> = Vec::new();
    for param in runtime_params
        .iter()
        .chain(with_default.iter().map(|(param, _)| param))
    {
        if !var_params.contains(param) {
            var_params.push(param.clone());
        }
    }

    let mut constants: Layer<Value> = Layer::over(statics);
    for (param, literal) in &default_literals {
        if !runtime_params.contains(param) {
            constants.set(param.clone(), literal.clone());
        }
    }
    let evaluate = |node: E| {
        attach_imports(Evaluator::new(tables.with_statics(&constants)), imports)
            .property_value(node)
            .ok()
            .flatten()
    };
    let mut deriver = Deriver {
        runtime: runtime_params,
        vars: &var_params,
        defaults: &hole_defaults,
        evaluate: &evaluate,
        derived: Vec::new(),
        replacements: Vec::new(),
    };
    deriver.visit_object(func.body);
    let Deriver {
        derived,
        replacements: planned,
        ..
    } = deriver;

    let mut replacements = Replacements::default();
    for (key, replacement) in &planned {
        let value = match replacement {
            Replacement::Constant(number) => Value::Num(*number),
            Replacement::Derived(name) => Value::str(name.as_str()),
        };
        replacements.insert(*key, value);
    }

    let var_names: Vec<String> = var_params
        .iter()
        .cloned()
        .chain(derived.iter().map(|entry| entry.name.clone()))
        .collect();

    let mut css_vars: IndexMap<String, String, FxBuildHasher> = IndexMap::default();
    if !var_names.is_empty() {
        for param in &var_params {
            temp.set(param.clone(), Value::str(param.as_str()));
        }
        let probe = attach_imports(Evaluator::with_replacements(tables.with_statics(&temp), &replacements), imports)
            .object(func.body)?;
        let hash = hash_object(&probe);
        for name in &var_names {
            css_vars.insert(name.clone(), format!("--{hash}-{name}"));
        }
        for param in &var_params {
            temp.set(
                param.clone(),
                Value::Str(format!("var({})", css_vars[param])),
            );
        }
        for (key, replacement) in &planned {
            if let Replacement::Derived(name) = replacement {
                replacements.insert(*key, Value::Str(format!("var({})", css_vars[name])));
            }
        }
    }

    let mut style = attach_imports(Evaluator::with_replacements(tables.with_statics(&temp), &replacements), imports)
        .object(func.body)?;

    let mut var_groups: IndexMap<String, Vec<VarGroup>, FxBuildHasher> = IndexMap::default();
    for name in &var_names {
        let css_var = css_vars.get(name).cloned().unwrap_or_default();
        let groups = split_var_by_unit(&mut style, &css_var);
        var_groups.insert(name.clone(), groups);
    }

    for (param, literal) in &default_literals {
        if let Some(groups) = var_groups.get(param) {
            for group in groups.clone() {
                apply_var_fallback(
                    &mut style,
                    &group.css_var,
                    literal,
                    &VarUnit {
                        unit: group.unit.clone(),
                        written: group.written,
                    },
                );
            }
        }
    }

    Ok(DynamicStyle {
        style,
        var_groups,
        derived,
    })
}
