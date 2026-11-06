use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};
use swc_core::common::{DUMMY_SP, Span, Spanned};
use swc_core::ecma::ast::*;
use swc_core::ecma::visit::{Visit, VisitWith};

use crate::engine::hash::hash_object;
use crate::engine::is_at_rule;
use crate::js::{Object, Value};
use crate::style::theme::{checked_var_type_hash, theme_atomic_map, theme_hash_of};
use crate::swc::eval::consts::collect_local_consts;
use crate::swc::eval::functions::{
    Derived, Literal, NamedParam, StyleFunctions, resolve_dynamic_style, style_functions_of,
};
use crate::swc::eval::{Env, Evaluator, NOTHING, resolve_theme_selector};
use crate::swc::link::{Alias, ImportEntry, ImportTable, LinkOptions, canonical_path, link_key, link_token, resolve_specifier};
use crate::swc::syntax::expr::{Call, E, K, str_value, unwrap};
use crate::swc::syntax::module::{Aliases, CORE, SpecKind, add_core_aliases, import_specs, module_export_name, plumeria_method};
use crate::swc::dropped::Context;
use crate::swc::eval::consts::collect_local_const_nodes;
use crate::swc::syntax::parse::Base;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Method {
    Create,
    CreateTheme,
    CreateStatic,
    Keyframes,
    ViewTransitionClass,
    PositionTry,
    VarType,
}

impl Method {
    fn of(name: &str) -> Option<Method> {
        Some(match name {
            "create" => Method::Create,
            "createTheme" => Method::CreateTheme,
            "createStatic" => Method::CreateStatic,
            "keyframes" => Method::Keyframes,
            "viewTransitionClass" => Method::ViewTransitionClass,
            "positionTry" => Method::PositionTry,
            "varType" => Method::VarType,
            _ => return None,
        })
    }

    fn name(self) -> &'static str {
        match self {
            Method::Create => "create",
            Method::CreateTheme => "createTheme",
            Method::CreateStatic => "createStatic",
            Method::Keyframes => "keyframes",
            Method::ViewTransitionClass => "viewTransitionClass",
            Method::PositionTry => "positionTry",
            Method::VarType => "varType",
        }
    }

    fn must_be_named(self) -> bool {
        matches!(
            self,
            Method::Create | Method::CreateTheme | Method::CreateStatic | Method::VarType
        )
    }
}

pub struct Definition<'b> {
    pub name: String,
    pub method: Method,
    pub call: Call<'b>,
    pub init: &'b Expr,
}

#[derive(Clone, Debug)]
pub struct DynamicVar {
    pub css_var: String,
    pub value: Expr,
}

#[derive(Clone, Debug)]
pub enum Entry {
    Static(Object),
    Dynamic {
        params: Vec<String>,
        named: Option<Vec<NamedParam>>,
        style: Object,
        vars: Vec<DynamicVar>,
    },
}

pub struct CreateStyles {
    pub entries: IndexMap<String, Entry, FxBuildHasher>,
}

#[derive(Clone, Debug)]
pub struct Global {
    pub kind: Method,
    pub hash: String,
    pub object: Object,
    pub selector: String,
}

pub struct Model<'b> {
    pub path: String,
    pub imports: ImportTable,
    pub definitions: Vec<Definition<'b>>,
    pub creates: IndexMap<String, CreateStyles, FxBuildHasher>,
    pub globals: IndexMap<String, Global, FxBuildHasher>,
    pub reexports: Vec<Alias>,
    pub link_values: Vec<(String, String)>,
    pub runtime_values: FxHashMap<String, Value>,
    /// The definitions read at runtime: the name of a local one, or the link
    /// token of an imported one. They count as uses of the definition's CSS.
    pub uses: Vec<String>,
}

pub struct Source<'s> {
    pub text: Option<&'s str>,
    pub base: Base,
    pub file: &'s str,
    pub failed_at: std::cell::Cell<Option<Span>>,
}

impl<'s> Source<'s> {
    pub fn new(text: &'s str, base: Base, file: &'s str) -> Self {
        Source {
            text: Some(text),
            base,
            file,
            failed_at: std::cell::Cell::new(None),
        }
    }

    pub fn without_text(file: &'s str) -> Self {
        Source {
            text: None,
            base: Base(0),
            file,
            failed_at: std::cell::Cell::new(None),
        }
    }

    pub fn fail(&self, message: impl Into<String>, span: Span) -> String {
        let message = message.into();
        match self.text {
            Some(text) => format!(
                "{message}{}",
                line_col_suffix(text, self.base.start(span), self.file)
            ),
            None => {
                if self.failed_at.get().is_none() {
                    self.failed_at.set(Some(span));
                }
                message
            }
        }
    }
}

fn collect_imports(
    module: &Module,
    options: &LinkOptions,
    file: &str,
) -> (Aliases, ImportTable) {
    let mut aliases = Aliases::default();
    let mut imports = ImportTable::default();
    for item in &module.body {
        let ModuleItem::ModuleDecl(ModuleDecl::Import(decl)) = item else {
            continue;
        };
        if decl.type_only {
            continue;
        }
        let source = str_value(&decl.src);
        if source == CORE {
            add_core_aliases(decl, &mut aliases);
            continue;
        }
        let Some(path) = resolve_specifier(options, file, &source) else {
            continue;
        };
        for spec in import_specs(decl) {
            if spec.type_only {
                continue;
            }
            let imported = match spec.kind {
                SpecKind::Named => Some(spec.imported.clone()),
                SpecKind::Default => Some("default".to_string()),
                SpecKind::Namespace => None,
            };
            imports.entries.insert(
                spec.local.to_string(),
                ImportEntry {
                    path: path.clone(),
                    imported,
                },
            );
        }
    }
    (aliases, imports)
}

fn top_level_definitions<'b>(module: &'b Module, aliases: &Aliases) -> Vec<Definition<'b>> {
    let mut definitions = Vec::new();
    for item in &module.body {
        if let ModuleItem::Stmt(Stmt::Expr(statement)) = item
            && let Some(call) = unwrap(E::new(&statement.expr)).call()
            && let Some(method) = call
                .callee
                .and_then(|callee| plumeria_method(callee, aliases))
                .and_then(Method::of)
            && !method.must_be_named()
        {
            definitions.push(Definition {
                name: format!("#{}", statement.span.lo.0),
                method,
                call,
                init: &statement.expr,
            });
            continue;
        }
        let decl = match item {
            ModuleItem::Stmt(Stmt::Decl(Decl::Var(decl))) => &**decl,
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &export.decl {
                Decl::Var(decl) => &**decl,
                _ => continue,
            },
            _ => continue,
        };
        for declarator in &decl.decls {
            let Pat::Ident(name) = &declarator.name else {
                continue;
            };
            let Some(init) = declarator.init.as_deref() else {
                continue;
            };
            let Some(call) = unwrap(E::new(init)).call() else {
                continue;
            };
            let Some(method) = call
                .callee
                .and_then(|callee| plumeria_method(callee, aliases))
                .and_then(Method::of)
            else {
                continue;
            };
            definitions.push(Definition {
                name: name.id.sym.to_string(),
                method,
                call,
                init,
            });
        }
    }
    definitions
}

struct StrayCalls<'a> {
    aliases: &'a Aliases,
    registered: &'a FxHashSet<u32>,
    found: Option<(Method, Span, bool)>,
    depth: usize,
}

impl StrayCalls<'_> {
    fn nested<T: VisitWith<Self>>(&mut self, node: &T) {
        self.depth += 1;
        node.visit_children_with(self);
        self.depth -= 1;
    }
}

impl Visit for StrayCalls<'_> {
    fn visit_call_expr(&mut self, it: &CallExpr) {
        if self.found.is_some() {
            return;
        }
        if let Callee::Expr(callee) = &it.callee
            && let Some(method) = plumeria_method(callee, self.aliases).and_then(Method::of)
            && method.must_be_named()
            && !self.registered.contains(&it.span.lo.0)
        {
            self.found = Some((method, it.span, self.depth > 0));
            return;
        }
        it.visit_children_with(self);
    }

    fn visit_function(&mut self, it: &Function) {
        self.nested(it);
    }

    fn visit_arrow_expr(&mut self, it: &ArrowExpr) {
        self.nested(it);
    }

    fn visit_block_stmt(&mut self, it: &BlockStmt) {
        self.nested(it);
    }

    fn visit_class(&mut self, it: &Class) {
        self.nested(it);
    }
}

fn exported_names(module: &Module, path: &str, options: &LinkOptions, file: &str) -> (Vec<(String, String)>, Vec<Alias>) {
    let mut exports = Vec::new();
    let mut reexports = Vec::new();
    for item in &module.body {
        match item {
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => {
                if let Decl::Var(decl) = &export.decl {
                    for declarator in &decl.decls {
                        if let Pat::Ident(name) = &declarator.name {
                            exports.push((name.id.sym.to_string(), name.id.sym.to_string()));
                        }
                    }
                }
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(named)) => {
                let target = named
                    .src
                    .as_ref()
                    .map(|src| resolve_specifier(options, file, &str_value(src)));
                for spec in &named.specifiers {
                    let ExportSpecifier::Named(spec) = spec else {
                        continue;
                    };
                    if spec.is_type_only {
                        continue;
                    }
                    let local = module_export_name(&spec.orig);
                    let exported = spec
                        .exported
                        .as_ref()
                        .map(module_export_name)
                        .unwrap_or_else(|| local.clone());
                    match &target {
                        None => exports.push((exported, local)),
                        Some(Some(target)) => reexports.push(Alias {
                            from: link_key(path, &exported, None),
                            to: link_key(target, &local, None),
                        }),
                        Some(None) => {}
                    }
                }
            }
            ModuleItem::ModuleDecl(ModuleDecl::ExportAll(all)) => {
                if let Some(target) = resolve_specifier(options, file, &str_value(&all.src)) {
                    reexports.push(Alias {
                        from: link_key(path, "*", None),
                        to: link_key(&target, "*", None),
                    });
                }
            }
            _ => {}
        }
    }
    (exports, reexports)
}

fn paren(expr: Expr) -> Expr {
    Expr::Paren(ParenExpr {
        span: DUMMY_SP,
        expr: Box::new(expr),
    })
}

fn binary(left: Expr, op: BinaryOp, right: Expr) -> Expr {
    Expr::Bin(BinExpr {
        span: DUMMY_SP,
        op,
        left: Box::new(left),
        right: Box::new(right),
    })
}

fn unary(op: UnaryOp, arg: Expr) -> Expr {
    Expr::Unary(UnaryExpr {
        span: DUMMY_SP,
        op,
        arg: Box::new(arg),
    })
}

fn identifier(name: &str) -> Expr {
    Expr::Ident(Ident::new_no_ctxt(name.into(), DUMMY_SP))
}

fn string(text: &str) -> Expr {
    Expr::Lit(Lit::Str(Str {
        span: DUMMY_SP,
        value: text.into(),
        raw: None,
    }))
}

fn literal_expr(literal: &Literal) -> Expr {
    match literal {
        Literal::Str(text) => string(text),
        Literal::Num(number) if *number < 0.0 => paren(unary(
            UnaryOp::Minus,
            Expr::Lit(Lit::Num(Number::from(-number))),
        )),
        Literal::Num(number) => Expr::Lit(Lit::Num(Number::from(*number))),
    }
}

fn derived_expr(derived: &Derived) -> Expr {
    match derived {
        Derived::Param(name, None) => paren(identifier(name)),
        Derived::Param(name, Some(fallback)) => paren(Expr::Cond(CondExpr {
            span: DUMMY_SP,
            test: Box::new(binary(
                paren(identifier(name)),
                BinaryOp::EqEqEq,
                identifier("undefined"),
            )),
            cons: Box::new(literal_expr(fallback)),
            alt: Box::new(paren(identifier(name))),
        })),
        Derived::Literal(literal) => literal_expr(literal),
        Derived::Binary(left, op, right) => {
            paren(binary(derived_expr(left), *op, derived_expr(right)))
        }
        Derived::Unary(op, argument) => paren(unary(*op, paren(derived_expr(argument)))),
    }
}

fn dynamic_value(source: &Expr, unit: &str, written: bool) -> Expr {
    if written {
        paren(binary(paren(source.clone()), BinaryOp::Add, string(unit)))
    } else if !unit.is_empty() {
        paren(Expr::Cond(CondExpr {
            span: DUMMY_SP,
            test: Box::new(binary(
                unary(UnaryOp::TypeOf, paren(source.clone())),
                BinaryOp::EqEqEq,
                string("number"),
            )),
            cons: Box::new(binary(paren(source.clone()), BinaryOp::Add, string(unit))),
            alt: Box::new(paren(source.clone())),
        }))
    } else {
        source.clone()
    }
}

struct Tables {
    keyframes: FxHashMap<String, String>,
    view_transitions: FxHashMap<String, String>,
    position_tries: FxHashMap<String, String>,
    var_types: FxHashMap<String, String>,
    theme_hashes: FxHashMap<String, String>,
    theme_objects: FxHashMap<String, Value>,
    static_hashes: FxHashMap<String, String>,
    static_objects: FxHashMap<String, Value>,
}

impl Tables {
    fn new() -> Self {
        Tables {
            keyframes: FxHashMap::default(),
            view_transitions: FxHashMap::default(),
            position_tries: FxHashMap::default(),
            var_types: FxHashMap::default(),
            theme_hashes: FxHashMap::default(),
            theme_objects: FxHashMap::default(),
            static_hashes: FxHashMap::default(),
            static_objects: FxHashMap::default(),
        }
    }

    fn env<'e>(&'e self, statics: &'e Object) -> Env<'e> {
        Env {
            statics,
            keyframes: &self.keyframes,
            view_transitions: &self.view_transitions,
            position_tries: &self.position_tries,
            var_types: &self.var_types,
            theme_hashes: &self.theme_hashes,
            theme_objects: &self.theme_objects,
            create_hashes: &NOTHING,
            static_hashes: &self.static_hashes,
            static_objects: &self.static_objects,
        }
    }
}

fn object_argument<'b>(
    definition: &Definition<'b>,
    index: usize,
    source: &Source,
    const_nodes: &crate::swc::eval::consts::ConstNodes<'b>,
) -> Result<&'b ObjectLit, String> {
    let argument = definition.call.arg(index).map(unwrap);
    let named = argument.and_then(|arg| match arg.kind() {
        K::Ident(ident) => const_nodes.get(ident.sym.as_str()).map(|expr| unwrap(E::new(expr))),
        _ => None,
    });
    match named.or(argument).map(|arg| arg.kind()) {
        Some(K::Object(object)) => Ok(object),
        _ => Err(source.fail(
            format!(
                "[typedcss] css.{} needs a style object it can read at build time. Pass an object literal or a top-level constant containing one.",
                definition.method.name()
            ),
            definition.call.span,
        )),
    }
}

fn link_value(value: &Value) -> Option<String> {
    match value {
        Value::Str(_) | Value::Num(_) => Some(value.to_js_string()),
        _ => None,
    }
}

pub fn analyze<'b>(
    module: &'b Module,
    source: &Source,
    options: &LinkOptions,
) -> Result<Model<'b>, String> {
    crate::swc::policy::assert_property_policy(module, options.policy, source.file)?;
    let path = canonical_path(options, source.file).unwrap_or_else(|| source.file.to_string());
    let (aliases, imports) = collect_imports(module, options, source.file);
    let definitions = top_level_definitions(module, &aliases);

    let registered: FxHashSet<u32> = definitions.iter().map(|d| d.call.span.lo.0).collect();
    let mut stray = StrayCalls {
        aliases: &aliases,
        registered: &registered,
        found: None,
        depth: 0,
    };
    module.visit_with(&mut stray);
    if let Some((method, span, nested)) = stray.found {
        let message = if nested {
            format!(
                "[typedcss] css.{} must be assigned to a top-level variable so its styles can be resolved across files. Move this declaration outside the function or block.",
                method.name()
            )
        } else {
            format!(
                "[typedcss] css.{} must be assigned to a named top-level variable. Destructuring, assignment statements, and default-exported calls cannot be compiled.",
                method.name()
            )
        };
        return Err(source.fail(message, span));
    }

    let consts = collect_local_consts(module, Some(&imports));
    let const_nodes = collect_local_const_nodes(module);
    let mut tables = Tables::new();
    let mut globals: IndexMap<String, Global, FxBuildHasher> = IndexMap::default();
    let mut theme_maps: FxHashMap<String, Object> = FxHashMap::default();
    let mut statics_of: FxHashMap<String, Object> = FxHashMap::default();

    for definition in &definitions {
        let fail = |message: String| source.fail(message, definition.call.span);
        let evaluate = |object: &ObjectLit, tables: &Tables| {
            let evaluator = Evaluator::new(tables.env(&consts)).importing(&imports);
            let obj = evaluator.object(object).map_err(fail)?;
            Context {
                evaluator,
                const_nodes: &const_nodes,
                source: source.text.unwrap_or_default(),
                base: source.base,
            }
            .assert_no_dropped_values(object, &obj, None)
            .map_err(fail)?;
            Ok::<Object, String>(obj)
        };
        match definition.method {
            Method::Create => {}
            Method::CreateTheme => {
                let selector_expr = definition.call.arg(0).ok_or_else(|| {
                    fail("[typedcss] createTheme needs a selector and a style object.".to_string())
                })?;
                let object = object_argument(definition, 1, source, &const_nodes)?;
                let selector = resolve_theme_selector(selector_expr, tables.env(&consts));
                if selector.is_empty() {
                    return Err(source.fail(
                        "[typedcss] createTheme needs a selector it can read at build time. Pass a string literal such as \".dark\", or a name this file declares as one.",
                        selector_expr.span(),
                    ));
                }
                if selector.starts_with('@') && !is_at_rule(&selector) {
                    return Err(source.fail(
                        format!(
                            "[typedcss] Unsupported at-rule: \"{selector}\". createTheme only supports nesting at-rules such as @media, @container, and @supports."
                        ),
                        selector_expr.span(),
                    ));
                }
                let obj = evaluate(object, &tables)?;
                let hash = theme_hash_of(&selector, &obj);
                tables.theme_hashes.insert(definition.name.clone(), hash.clone());
                tables.theme_objects.insert(hash.clone(), Value::obj(obj.clone()));
                theme_maps.insert(definition.name.clone(), theme_atomic_map(&hash, &obj));
                globals.insert(
                    definition.name.clone(),
                    Global {
                        kind: Method::CreateTheme,
                        hash,
                        object: obj,
                        selector,
                    },
                );
            }
            Method::CreateStatic => {
                let object = object_argument(definition, 0, source, &const_nodes)?;
                let obj = evaluate(object, &tables)?;
                let hash = hash_object(&obj);
                tables.static_hashes.insert(definition.name.clone(), hash.clone());
                tables.static_objects.insert(hash, Value::obj(obj.clone()));
                statics_of.insert(definition.name.clone(), obj);
            }
            Method::VarType => {
                let object = object_argument(definition, 0, source, &const_nodes)?;
                let obj = evaluate(object, &tables)?;
                let hash = checked_var_type_hash(&definition.name, &obj).map_err(fail)?;
                tables.var_types.insert(definition.name.clone(), hash.clone());
                globals.insert(
                    definition.name.clone(),
                    Global {
                        kind: Method::VarType,
                        hash,
                        object: obj,
                        selector: String::new(),
                    },
                );
            }
            Method::Keyframes | Method::ViewTransitionClass | Method::PositionTry => {
                let object = object_argument(definition, 0, source, &const_nodes)?;
                let obj = evaluate(object, &tables)?;
                let hash = hash_object(&obj);
                let table = match definition.method {
                    Method::Keyframes => &mut tables.keyframes,
                    Method::ViewTransitionClass => &mut tables.view_transitions,
                    _ => &mut tables.position_tries,
                };
                table.insert(definition.name.clone(), hash.clone());
                globals.insert(
                    definition.name.clone(),
                    Global {
                        kind: definition.method,
                        hash,
                        object: obj,
                        selector: String::new(),
                    },
                );
            }
        }
    }

    let mut creates: IndexMap<String, CreateStyles, FxBuildHasher> = IndexMap::default();
    for definition in definitions.iter().filter(|d| d.method == Method::Create) {
        let fail = |message: String| source.fail(message, definition.call.span);
        let object = object_argument(definition, 0, source, &const_nodes)?;
        let local_objects: FxHashMap<String, Value> = creates
            .iter()
            .map(|(name, styles)| {
                let mut object = Object::new();
                for (key, entry) in &styles.entries {
                    if let Entry::Static(style) = entry {
                        object.insert(key, Value::obj(style.clone()));
                    }
                }
                (name.clone(), Value::obj(object))
            })
            .chain(
                theme_maps
                    .iter()
                    .map(|(name, map)| (name.clone(), Value::obj(map.clone()))),
            )
            .collect();
        let resolver = |key: &str| local_objects.get(key).cloned();
        let evaluator = Evaluator::with_resolver(tables.env(&consts), &resolver).importing(&imports);
        let evaluated = evaluator.object(object).map_err(fail)?;
        Context {
            evaluator,
            const_nodes: &const_nodes,
            source: source.text.unwrap_or_default(),
            base: source.base,
        }
        .assert_no_dropped_values(object, &evaluated, None)
        .map_err(fail)?;
        let functions: StyleFunctions = style_functions_of(object);
        let mut entries: IndexMap<String, Entry, FxBuildHasher> = IndexMap::default();
        for (key, value) in evaluated.iter() {
            if let Value::Obj(style) = value {
                entries.insert(key.to_string(), Entry::Static((**style).clone()));
            }
        }
        for (key, func) in &functions {
            let runtime: Vec<String> = match &func.named {
                Some(named) => named.iter().map(|param| param.local.clone()).collect(),
                None => func.params.clone(),
            };
            let resolved = resolve_dynamic_style(
                func,
                &runtime,
                &consts,
                tables.env(&consts),
                Some(&FxHashSet::default()),
                &[],
                Some(&imports),
            )
            .map_err(fail)?;
            let mut sources: Vec<(String, Expr)> = runtime
                .iter()
                .map(|param| (param.clone(), identifier(param)))
                .collect();
            for entry in &resolved.derived {
                let value = match &entry.expr {
                    Derived::Binary(left, op, right) => {
                        binary(derived_expr(left), *op, derived_expr(right))
                    }
                    Derived::Unary(op, argument) => unary(*op, paren(derived_expr(argument))),
                    other => derived_expr(other),
                };
                sources.push((entry.name.clone(), value));
            }
            let mut vars = Vec::new();
            for (name, value_source) in &sources {
                for group in resolved.var_groups.get(name).into_iter().flatten() {
                    vars.push(DynamicVar {
                        css_var: group.css_var.clone(),
                        value: dynamic_value(value_source, &group.unit, group.written),
                    });
                }
            }
            entries.insert(
                key.clone(),
                Entry::Dynamic {
                    params: func.params.clone(),
                    named: func.named.clone(),
                    style: resolved.style,
                    vars,
                },
            );
        }
        let mut ordered: IndexMap<String, Entry, FxBuildHasher> = IndexMap::default();
        for prop in &object.props {
            let PropOrSpread::Prop(prop) = prop else {
                continue;
            };
            let Prop::KeyValue(pair) = &**prop else {
                continue;
            };
            let key = match &pair.key {
                PropName::Ident(ident) => ident.sym.to_string(),
                PropName::Str(value) => str_value(value),
                _ => continue,
            };
            if let Some(entry) = entries.shift_remove(&key) {
                ordered.insert(key, entry);
            }
        }
        ordered.extend(entries);
        creates.insert(
            definition.name.clone(),
            CreateStyles {
                entries: ordered,
            },
        );
    }

    let mut runtime_values: FxHashMap<String, Value> = FxHashMap::default();
    for (name, global) in &globals {
        let value = match global.kind {
            Method::Keyframes => Value::Str(format!("kf-{}", global.hash)),
            Method::ViewTransitionClass => Value::Str(format!("vt-{}", global.hash)),
            Method::PositionTry => Value::Str(format!("--pt-{}", global.hash)),
            Method::VarType => Value::Str(format!("--pr-{}", global.hash)),
            Method::CreateTheme => match theme_maps.get(name) {
                Some(map) => Value::obj(map.clone()),
                None => continue,
            },
            Method::Create | Method::CreateStatic => continue,
        };
        runtime_values.insert(name.clone(), value);
    }
    for (name, object) in &statics_of {
        runtime_values.insert(name.clone(), Value::obj(object.clone()));
    }

    let (exports, reexports) = exported_names(module, &path, options, source.file);
    let mut link_values = Vec::new();
    for (exported, local) in &exports {
        let key = |member: Option<&str>| link_key(&path, exported, member);
        if let Some(global) = globals.get(local) {
            let value = match global.kind {
                Method::Keyframes => Some(format!("kf-{}", global.hash)),
                Method::ViewTransitionClass => Some(format!("vt-{}", global.hash)),
                Method::PositionTry => Some(format!("--pt-{}", global.hash)),
                Method::VarType => Some(format!("--pr-{}", global.hash)),
                _ => None,
            };
            if let Some(value) = value {
                link_values.push((key(None), value));
            }
        }
        if let Some(map) = theme_maps.get(local) {
            for (member, value) in map.iter() {
                if let Some(value) = link_value(value) {
                    link_values.push((key(Some(member)), value));
                }
            }
            continue;
        }
        let object = statics_of
            .get(local)
            .cloned()
            .map(Value::obj)
            .or_else(|| consts.get(local).cloned());
        match object {
            Some(Value::Obj(object)) => {
                for (member, value) in object.iter() {
                    if let Some(value) = link_value(value) {
                        link_values.push((key(Some(member)), value));
                    }
                }
            }
            Some(value) => {
                if let Some(value) = link_value(&value) {
                    link_values.push((key(None), value));
                }
            }
            None => {}
        }
    }

    let skipped: FxHashSet<(u32, u32)> = definitions
        .iter()
        .map(|definition| (definition.init.span().lo.0, definition.init.span().hi.0))
        .collect();
    let mut uses = Vec::new();
    for read in crate::swc::reads::runtime_reads(module, &skipped) {
        if let Some(name) = globals.get(&read.local).and_then(definition_name) {
            uses.push(name);
            continue;
        }
        let Some(entry) = imports.entries.get(&read.local) else {
            continue;
        };
        let key = match (entry.imported.as_deref(), read.member.as_deref()) {
            (Some(imported), _) => link_key(&entry.path, imported, None),
            (None, Some(member)) => link_key(&entry.path, member, None),
            (None, None) => continue,
        };
        uses.push(link_token(&key));
    }

    Ok(Model {
        path,
        imports,
        definitions,
        creates,
        globals,
        reexports,
        link_values,
        runtime_values,
        uses,
    })
}

/// The name a definition's CSS is emitted under, for the definitions whose CSS
/// is emitted only where that name is used.
pub fn definition_name(global: &Global) -> Option<String> {
    match global.kind {
        Method::Keyframes => Some(format!("kf-{}", global.hash)),
        Method::ViewTransitionClass => Some(format!("vt-{}", global.hash)),
        Method::PositionTry => Some(format!("--pt-{}", global.hash)),
        Method::VarType => Some(format!("--pr-{}", global.hash)),
        Method::CreateTheme | Method::Create | Method::CreateStatic => None,
    }
}

fn line_col_suffix(source: &str, offset: u32, resource: &str) -> String {
    let bytes = source.as_bytes();
    let offset = offset as usize;
    let mut line = 1;
    let mut col_start = 0;
    for (index, byte) in bytes.iter().enumerate().take(offset.min(bytes.len())) {
        if *byte == b'\n' {
            line += 1;
            col_start = index + 1;
        }
    }
    let col = offset.saturating_sub(col_start) + 1;
    format!(" ({}:{line}:{col})", crate::fs::path::basename(resource))
}
