use rustc_hash::FxHashMap;
use swc_core::common::{DUMMY_SP, Span, Spanned, SyntaxContext};
use swc_core::ecma::ast::*;
use swc_core::ecma::codegen::{Config, Emitter, text_writer::JsWriter};
use swc_core::ecma::visit::{Visit, VisitMut, VisitMutWith, VisitWith};

use crate::js::{Object, Value};
use crate::style::records::atom_map;
use crate::swc::extract::file_styles;
use crate::swc::link::{FileStyles, LinkOptions};
use crate::swc::model::{Entry, Method, Source, analyze};
use crate::swc::syntax::module::CORE;
use crate::swc::syntax::parse::parse_program;

pub const DEFAULT_STYLE_PROP: &str = "sx";
pub const PROPS_LOCAL: &str = "__typedcss_props";
pub const CSS_MARKER: &str = "$$css";
pub const WEIGHT_MARKER: &str = "$$w";

#[derive(Clone, Debug)]
pub struct TransformOptions {
    pub link: LinkOptions,
    pub style_prop: String,
    pub class_prop: String,
}

fn ident(name: &str) -> Ident {
    Ident::new_no_ctxt(name.into(), DUMMY_SP)
}

struct FindStyleProp<'s> {
    style_prop: &'s str,
    found: bool,
}

impl Visit for FindStyleProp<'_> {
    fn visit_jsx_attr(&mut self, attr: &JSXAttr) {
        if let JSXAttrName::Ident(name) = &attr.name {
            if name.sym == *self.style_prop {
                self.found = true;
                return;
            }
        }
        attr.visit_children_with(self);
    }
}

pub fn needs_transform(module: &Module, style_prop: &str) -> bool {
    let imports_core = module.body.iter().any(|item| {
        matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) if decl.src.value == *CORE)
    });
    if imports_core {
        return true;
    }
    let mut finder = FindStyleProp {
        style_prop,
        found: false,
    };
    module.visit_with(&mut finder);
    finder.found
}

fn str_expr(text: &str) -> Expr {
    Expr::Lit(Lit::Str(Str {
        span: DUMMY_SP,
        value: text.into(),
        raw: None,
    }))
}

fn num_expr(number: f64) -> Expr {
    let positive = Expr::Lit(Lit::Num(Number {
        span: DUMMY_SP,
        value: number.abs(),
        raw: None,
    }));
    if number.is_sign_negative() && number != 0.0 {
        Expr::Unary(UnaryExpr {
            span: DUMMY_SP,
            op: UnaryOp::Minus,
            arg: Box::new(positive),
        })
    } else {
        positive
    }
}

fn key(text: &str) -> PropName {
    let is_identifier = text
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
    if is_identifier {
        PropName::Ident(IdentName::new(text.into(), DUMMY_SP))
    } else {
        PropName::Str(Str {
            span: DUMMY_SP,
            value: text.into(),
            raw: None,
        })
    }
}

fn pair(name: &str, value: Expr) -> PropOrSpread {
    PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: key(name),
        value: Box::new(value),
    })))
}

fn object_expr(props: Vec<PropOrSpread>) -> Expr {
    Expr::Object(ObjectLit {
        span: DUMMY_SP,
        props,
    })
}

pub fn value_expr(value: &Value) -> Expr {
    match value {
        Value::Str(text) => str_expr(text),
        Value::Num(number) => num_expr(*number),
        Value::Bool(flag) => Expr::Lit(Lit::Bool(Bool {
            span: DUMMY_SP,
            value: *flag,
        })),
        Value::Obj(object) => object_expr(
            object
                .iter()
                .map(|(name, value)| pair(name, value_expr(value)))
                .collect(),
        ),
        _ => Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
    }
}

fn class_map(style: &Object) -> Expr {
    let mut props: Vec<PropOrSpread> = atom_map(style)
        .iter()
        .map(|(slot, class)| pair(slot, value_expr(class)))
        .collect();
    let atoms = crate::style::escalation::state_atoms(style);
    if !atoms.is_empty() {
        let list = |items: Vec<Expr>| {
            Expr::Array(ArrayLit {
                span: DUMMY_SP,
                elems: items.into_iter().map(|expr| Some(ExprOrSpread { spread: None, expr: Box::new(expr) })).collect(),
            })
        };
        props.push(pair(
            WEIGHT_MARKER,
            object_expr(
                atoms
                    .iter()
                    .map(|atom| {
                        let mut entry = vec![
                            str_expr(&atom.group),
                            list(atom.base.iter().map(|n| num_expr(*n as f64)).collect()),
                        ];
                        if !atom.covers.is_empty() {
                            entry.push(list(atom.covers.iter().map(|p| str_expr(p)).collect()));
                        }
                        pair(&atom.key, list(entry))
                    })
                    .collect(),
            ),
        ));
    }
    props.push(pair(
        CSS_MARKER,
        Expr::Lit(Lit::Bool(Bool {
            span: DUMMY_SP,
            value: true,
        })),
    ));
    object_expr(props)
}

fn binding(name: &str) -> Pat {
    Pat::Ident(BindingIdent {
        id: ident(name),
        type_ann: None,
    })
}

fn entry_expr(entry: &Entry) -> Result<Expr, String> {
    let Entry::Dynamic {
        params,
        named,
        style,
        vars,
    } = entry
    else {
        let Entry::Static(style) = entry else {
            unreachable!()
        };
        return Ok(class_map(style));
    };
    let params: Vec<Pat> = match named {
        Some(named) => vec![Pat::Assign(AssignPat {
            span: DUMMY_SP,
            left: Box::new(Pat::Object(ObjectPat {
            span: DUMMY_SP,
            props: named
                .iter()
                .map(|param| {
                    if param.key == param.local {
                        ObjectPatProp::Assign(AssignPatProp {
                            span: DUMMY_SP,
                            key: BindingIdent {
                                id: ident(&param.local),
                                type_ann: None,
                            },
                            value: None,
                        })
                    } else {
                        ObjectPatProp::KeyValue(KeyValuePatProp {
                            key: key(&param.key),
                            value: Box::new(binding(&param.local)),
                        })
                    }
                })
                .collect(),
            optional: false,
            type_ann: None,
            })),
            right: Box::new(object_expr(Vec::new())),
        })],
        None => params.iter().map(|param| binding(param)).collect(),
    };
    let mut var_props = Vec::new();
    for var in vars {
        var_props.push(pair(&var.css_var, var.value.clone()));
    }
    let body = Expr::Array(ArrayLit {
        span: DUMMY_SP,
        elems: vec![
            Some(ExprOrSpread {
                spread: None,
                expr: Box::new(class_map(style)),
            }),
            Some(ExprOrSpread {
                spread: None,
                expr: Box::new(object_expr(var_props)),
            }),
        ],
    });
    Ok(Expr::Arrow(ArrowExpr {
        span: DUMMY_SP,
        ctxt: SyntaxContext::empty(),
        params,
        body: Box::new(ArrowFunctionBody::Expr(Box::new(body))),
        is_async: false,
        is_generator: false,
        type_params: None,
        return_type: None,
    }))
}

fn span_key(span: Span) -> (u32, u32) {
    (span.lo.0, span.hi.0)
}

struct ReplaceInits {
    plan: FxHashMap<(u32, u32), Expr>,
}

impl VisitMut for ReplaceInits {
    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        items.retain(|item| match item {
            ModuleItem::Stmt(Stmt::Expr(statement)) => self.plan.remove(&span_key(statement.expr.span())).is_none(),
            _ => true,
        });
        items.visit_mut_children_with(self);
    }

    fn visit_mut_var_declarator(&mut self, it: &mut VarDeclarator) {
        if let Some(init) = &mut it.init
            && let Some(replacement) = self.plan.remove(&span_key(init.span()))
        {
            **init = replacement;
            return;
        }
        it.visit_mut_children_with(self);
    }
}

fn attr_name(attr: &JSXAttrOrSpread) -> Option<&str> {
    match attr {
        JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(name),
            ..
        }) => Some(name.sym.as_str()),
        _ => None,
    }
}

struct StyleProp<'s> {
    style_prop: &'s str,
    source: &'s Source<'s>,
    used: bool,
    error: Option<String>,
}

impl StyleProp<'_> {
    fn arguments(value: JSXAttrValue) -> Vec<ExprOrSpread> {
        let expr = match value {
            JSXAttrValue::JSXExprContainer(JSXExprContainer {
                expr: JSXExpr::Expr(expr),
                ..
            }) => expr,
            _ => return Vec::new(),
        };
        let mut inner = expr;
        while let Expr::Paren(paren) = *inner {
            inner = paren.expr;
        }
        match *inner {
            Expr::Array(array) => array.elems.into_iter().flatten().collect(),
            other => vec![ExprOrSpread {
                spread: None,
                expr: Box::new(other),
            }],
        }
    }
}

impl StyleProp<'_> {
    fn function_in(&self, attr: &JSXAttrOrSpread) -> Option<String> {
        let JSXAttrOrSpread::JSXAttr(JSXAttr {
            value:
                Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                    expr: JSXExpr::Expr(expr),
                    ..
                })),
            ..
        }) = attr
        else {
            return None;
        };
        let mut pending = vec![&**expr];
        while let Some(expr) = pending.pop() {
            match expr {
                Expr::Paren(paren) => pending.push(&paren.expr),
                Expr::Array(array) => pending.extend(array.elems.iter().flatten().map(|element| &*element.expr)),
                Expr::Cond(cond) => pending.extend([&*cond.cons, &*cond.alt]),
                Expr::Bin(bin) if matches!(bin.op, BinaryOp::LogicalAnd | BinaryOp::LogicalOr | BinaryOp::NullishCoalescing) => {
                    pending.push(&bin.right)
                }
                Expr::Fn(_) | Expr::Arrow(_) => {
                    let text = self.source.text.map(|text| self.source.base.text(text, expr.span())).unwrap_or_default();
                    return Some(self.source.fail(
                        format!("[typedcss] Dynamic or unresolvable style object \"{text}\" is not supported."),
                        expr.span(),
                    ));
                }
                _ => {}
            }
        }
        None
    }
}

impl VisitMut for StyleProp<'_> {
    fn visit_mut_jsx_opening_element(&mut self, it: &mut JSXOpeningElement) {
        it.visit_mut_children_with(self);
        if self.error.is_some() {
            return;
        }
        let JSXElementName::Ident(name) = &it.name else {
            return;
        };
        if !name.sym.starts_with(|c: char| c.is_ascii_lowercase()) {
            return;
        }
        let Some(index) = it
            .attrs
            .iter()
            .position(|attr| attr_name(attr) == Some(self.style_prop))
        else {
            return;
        };
        if let Some(other) = it
            .attrs
            .iter()
            .filter_map(attr_name)
            .find(|name| *name == "className" || *name == "style")
        {
            self.error = Some(self.source.fail(
                format!(
                    "[typedcss] <{}> has both {} and {other}. css.props sets className and style itself, so write the extra classes or inline styles as styles in {}.",
                    name.sym,
                    self.style_prop,
                    self.style_prop
                ),
                it.attrs[index].span(),
            ));
            return;
        }
        if let Some(function) = self.function_in(&it.attrs[index]) {
            self.error = Some(function);
            return;
        }
        let JSXAttrOrSpread::JSXAttr(attr) = it.attrs.remove(index) else {
            unreachable!()
        };
        let span = attr.span;
        let args = attr.value.map(Self::arguments).unwrap_or_default();
        let call = Expr::Call(CallExpr {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            callee: Callee::Expr(Box::new(Expr::Ident(ident(PROPS_LOCAL)))),
            args,
            type_args: None,
        });
        it.attrs.insert(
            index,
            JSXAttrOrSpread::SpreadElement(SpreadElement {
                dot3_token: span,
                expr: Box::new(call),
            }),
        );
        self.used = true;
    }

}

fn props_import(class_prop: &str) -> ModuleItem {
    let imported = if class_prop == "class" { "classProps" } else { "props" };
    ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
        span: DUMMY_SP,
        specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: ident(PROPS_LOCAL),
            imported: Some(ModuleExportName::Ident(ident(imported))),
            is_type_only: false,
        })],
        src: Box::new(Str {
            span: DUMMY_SP,
            value: CORE.into(),
            raw: None,
        }),
        type_only: false,
        with: None,
        phase: Default::default(),
    }))
}

fn directive_count(module: &Module) -> usize {
    module
        .body
        .iter()
        .take_while(|item| {
            matches!(
                item,
                ModuleItem::Stmt(Stmt::Expr(ExprStmt { expr, .. }))
                    if matches!(&**expr, Expr::Lit(Lit::Str(_)))
            )
        })
        .count()
}

fn import_end(module: &Module) -> usize {
    let start = directive_count(module);
    start
        + module.body[start..]
            .iter()
            .take_while(|item| matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(_))))
            .count()
}

pub fn transform_module(
    module: &mut Module,
    source: &Source,
    options: &TransformOptions,
) -> Result<FileStyles, String> {
    let before = crate::swc::elide::referenced(module);
    let mut plan: FxHashMap<(u32, u32), Expr> = FxHashMap::default();
    let styles = {
        let model = analyze(module, source, &options.link)?;
        for definition in &model.definitions {
            let replacement = match definition.method {
                Method::Create => {
                    let Some(styles) = model.creates.get(&definition.name) else {
                        continue;
                    };
                    let mut props = Vec::new();
                    for (name, entry) in &styles.entries {
                        props.push(pair(name, entry_expr(entry)?));
                    }
                    object_expr(props)
                }
                _ => match model.runtime_values.get(&definition.name) {
                    Some(value) => value_expr(value),
                    None => continue,
                },
            };
            plan.insert(span_key(definition.init.span()), replacement);
        }
        file_styles(&model)
    };
    module.visit_mut_with(&mut ReplaceInits { plan });

    let mut style_prop = StyleProp {
        style_prop: &options.style_prop,
        source,
        used: false,
        error: None,
    };
    module.visit_mut_with(&mut style_prop);
    if let Some(error) = style_prop.error {
        return Err(error);
    }
    crate::swc::elide::elide_imports(module, &before, CORE);
    if style_prop.used {
        let at = import_end(module);
        module.body.insert(at, props_import(&options.class_prop));
    }
    Ok(styles)
}

pub fn print_module(
    module: &Module,
    map: swc_core::common::sync::Lrc<swc_core::common::SourceMap>,
    comments: &swc_core::common::comments::SingleThreadedComments,
) -> String {
    let mut buffer = Vec::new();
    {
        let writer = JsWriter::new(map.clone(), "\n", &mut buffer, None);
        let mut emitter = Emitter {
            cfg: Config::default(),
            cm: map,
            comments: Some(comments),
            wr: writer,
        };
        emitter.emit_module(module).expect("writing to a buffer cannot fail");
    }
    String::from_utf8(buffer).unwrap_or_default()
}

#[cfg(test)]
pub fn transform_source(text: &str, file: &str, options: &TransformOptions) -> Result<String, String> {
    let mut parsed = parse_program(text)?;
    let source = Source::new(text, parsed.base, file);
    transform_module(&mut parsed.module, &source, options)?;
    Ok(print_module(&parsed.module, parsed.map, &parsed.comments))
}

pub fn transform_if_needed(text: &str, file: &str, options: &TransformOptions) -> Result<Option<String>, String> {
    let mut parsed = parse_program(text)?;
    if !needs_transform(&parsed.module, &options.style_prop) {
        return Ok(None);
    }
    let source = Source::new(text, parsed.base, file);
    let styles = transform_module(&mut parsed.module, &source, options)?;
    crate::stylesheet::remember(file, text, &options.link, styles);
    Ok(Some(print_module(&parsed.module, parsed.map, &parsed.comments)))
}
