use indexmap::IndexMap;
use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};
use oxc_ast::ast::*;
use oxc_ast_visit::{Visit, walk};
use oxc_span::{GetSpan, Span};
use oxc_syntax::scope::ScopeFlags;

use crate::engine::hash::hash_object;
use crate::engine::is_at_rule;
use crate::js::{Object, Value};
use crate::style::theme::{checked_var_type_hash, theme_atomic_map, theme_hash_of};
use crate::oxc::eval::consts::collect_local_consts;
use crate::oxc::eval::functions::{
    Derived, Literal, NamedParam, StyleFunctions, resolve_dynamic_style, style_functions_of,
};
use crate::oxc::eval::{Env, Evaluator, NOTHING, resolve_theme_selector};
use crate::oxc::link::{Alias, ImportEntry, ImportTable, LinkOptions, canonical_path, link_key, link_token, resolve_specifier};
use crate::oxc::syntax::expr::{BinaryOp, Call, E, K, Key, UnaryOp, as_key_value, str_value, unwrap};
use crate::oxc::syntax::module::{Aliases, CORE, SpecKind, add_core_aliases, import_specs, module_export_name, plumeria_method};
use crate::oxc::dropped::Context;
use crate::oxc::eval::consts::collect_local_const_nodes;
use crate::oxc::syntax::parse::Base;

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
    pub init: &'b Expression<'b>,
}

/// The JS that computes a dynamic CSS variable from the style function's
/// parameters, built into the output by the transform.
#[derive(Clone, Debug)]
pub enum Code {
    Ident(String),
    Str(String),
    Num(f64),
    Paren(Box<Code>),
    Binary(Box<Code>, BinaryOp, Box<Code>),
    Unary(UnaryOp, Box<Code>),
    Cond(Box<Code>, Box<Code>, Box<Code>),
}

#[derive(Clone, Debug)]
pub struct DynamicVar {
    pub css_var: String,
    pub value: Code,
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
    program: &Program,
    options: &LinkOptions,
    file: &str,
) -> (Aliases, ImportTable) {
    let mut aliases = Aliases::default();
    let mut imports = ImportTable::default();
    for item in &program.body {
        let Statement::ImportDeclaration(decl) = item else {
            continue;
        };
        if decl.import_kind.is_type() {
            continue;
        }
        let source = str_value(&decl.source);
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

fn top_level_definitions<'b>(program: &'b Program<'b>, aliases: &Aliases) -> Vec<Definition<'b>> {
    let mut definitions = Vec::new();
    for item in &program.body {
        if let Statement::ExpressionStatement(statement) = item
            && let Some(call) = unwrap(E::new(&statement.expression)).call()
            && let Some(method) = call
                .callee
                .and_then(|callee| plumeria_method(callee, aliases))
                .and_then(Method::of)
            && !method.must_be_named()
        {
            definitions.push(Definition {
                name: format!("#{}", statement.span.start),
                method,
                call,
                init: &statement.expression,
            });
            continue;
        }
        let decl = match item {
            Statement::VariableDeclaration(decl) => &**decl,
            Statement::ExportDeclaration(export) => match &export.declaration {
                Declaration::VariableDeclaration(decl) => &**decl,
                _ => continue,
            },
            _ => continue,
        };
        for declarator in &decl.declarations {
            let BindingPattern::BindingIdentifier(name) = &declarator.id else {
                continue;
            };
            let Some(init) = declarator.init.as_ref() else {
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
                name: name.name.to_string(),
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
    fn nested(&mut self, walk: impl FnOnce(&mut Self)) {
        self.depth += 1;
        walk(self);
        self.depth -= 1;
    }
}

impl<'a> Visit<'a> for StrayCalls<'_> {
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        if self.found.is_some() {
            return;
        }
        if let Some(method) = plumeria_method(&it.callee, self.aliases).and_then(Method::of)
            && method.must_be_named()
            && !self.registered.contains(&it.span.start)
        {
            self.found = Some((method, it.span, self.depth > 0));
            return;
        }
        walk::walk_call_expression(self, it);
    }

    fn visit_function(&mut self, it: &Function<'a>, flags: ScopeFlags) {
        self.nested(|this| walk::walk_function(this, it, flags));
    }

    fn visit_arrow_function_expression(&mut self, it: &ArrowFunctionExpression<'a>) {
        self.nested(|this| walk::walk_arrow_function_expression(this, it));
    }

    fn visit_block_statement(&mut self, it: &BlockStatement<'a>) {
        self.nested(|this| walk::walk_block_statement(this, it));
    }

    fn visit_class(&mut self, it: &Class<'a>) {
        self.nested(|this| walk::walk_class(this, it));
    }
}

fn exported_names(program: &Program, path: &str, options: &LinkOptions, file: &str) -> (Vec<(String, String)>, Vec<Alias>) {
    let mut exports = Vec::new();
    let mut reexports = Vec::new();
    let named = |specifiers: &[ExportSpecifier]| {
        specifiers
            .iter()
            .filter(|spec| !spec.export_kind.is_type())
            .map(|spec| (module_export_name(&spec.exported), module_export_name(&spec.local)))
            .collect::<Vec<_>>()
    };
    for item in &program.body {
        match item {
            Statement::ExportDeclaration(export) => {
                if let Declaration::VariableDeclaration(decl) = &export.declaration {
                    for declarator in &decl.declarations {
                        if let BindingPattern::BindingIdentifier(name) = &declarator.id {
                            exports.push((name.name.to_string(), name.name.to_string()));
                        }
                    }
                }
            }
            Statement::ExportNamedDeclaration(export) => exports.extend(named(&export.specifiers)),
            Statement::ExportFromDeclaration(export) => {
                if let Some(target) = resolve_specifier(options, file, &str_value(&export.source)) {
                    for (exported, local) in named(&export.specifiers) {
                        reexports.push(Alias {
                            from: link_key(path, &exported, None),
                            to: link_key(&target, &local, None),
                        });
                    }
                }
            }
            Statement::ExportAllDeclaration(all) if all.exported.is_none() => {
                if let Some(target) = resolve_specifier(options, file, &str_value(&all.source)) {
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

fn paren(code: Code) -> Code {
    Code::Paren(Box::new(code))
}

fn binary(left: Code, op: BinaryOp, right: Code) -> Code {
    Code::Binary(Box::new(left), op, Box::new(right))
}

fn unary(op: UnaryOp, arg: Code) -> Code {
    Code::Unary(op, Box::new(arg))
}

fn identifier(name: &str) -> Code {
    Code::Ident(name.to_string())
}

fn string(text: &str) -> Code {
    Code::Str(text.to_string())
}

fn conditional(test: Code, cons: Code, alt: Code) -> Code {
    Code::Cond(Box::new(test), Box::new(cons), Box::new(alt))
}

fn literal_expr(literal: &Literal) -> Code {
    match literal {
        Literal::Str(text) => string(text),
        Literal::Num(number) if *number < 0.0 => paren(unary(UnaryOp::Minus, Code::Num(-number))),
        Literal::Num(number) => Code::Num(*number),
    }
}

fn derived_expr(derived: &Derived) -> Code {
    match derived {
        Derived::Param(name, None) => paren(identifier(name)),
        Derived::Param(name, Some(fallback)) => paren(conditional(
            binary(paren(identifier(name)), BinaryOp::EqEqEq, identifier("undefined")),
            literal_expr(fallback),
            paren(identifier(name)),
        )),
        Derived::Literal(literal) => literal_expr(literal),
        Derived::Binary(left, op, right) => {
            paren(binary(derived_expr(left), *op, derived_expr(right)))
        }
        Derived::Unary(op, argument) => paren(unary(*op, paren(derived_expr(argument)))),
    }
}

fn dynamic_value(source: &Code, unit: &str, written: bool) -> Code {
    if written {
        paren(binary(paren(source.clone()), BinaryOp::Add, string(unit)))
    } else if !unit.is_empty() {
        paren(conditional(
            binary(
                unary(UnaryOp::TypeOf, paren(source.clone())),
                BinaryOp::EqEqEq,
                string("number"),
            ),
            binary(paren(source.clone()), BinaryOp::Add, string(unit)),
            paren(source.clone()),
        ))
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
    const_nodes: &crate::oxc::eval::consts::ConstNodes<'b>,
) -> Result<&'b ObjectExpression<'b>, String> {
    let argument = definition.call.arg(index).map(unwrap);
    let named = argument.and_then(|arg| match arg.kind() {
        K::Ident(ident) => const_nodes.get(ident.name.as_str()).map(|expr| unwrap(E::new(expr))),
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
    program: &'b Program<'b>,
    source: &Source,
    options: &LinkOptions,
) -> Result<Model<'b>, String> {
    crate::oxc::policy::assert_property_policy(program, options.policy, source.file)?;
    let path = canonical_path(options, source.file).unwrap_or_else(|| source.file.to_string());
    let (aliases, imports) = collect_imports(program, options, source.file);
    let definitions = top_level_definitions(program, &aliases);

    let registered: FxHashSet<u32> = definitions.iter().map(|d| d.call.span.start).collect();
    let mut stray = StrayCalls {
        aliases: &aliases,
        registered: &registered,
        found: None,
        depth: 0,
    };
    stray.visit_program(program);
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

    let consts = collect_local_consts(program, Some(&imports));
    let const_nodes = collect_local_const_nodes(program);
    let mut tables = Tables::new();
    let mut globals: IndexMap<String, Global, FxBuildHasher> = IndexMap::default();
    let mut theme_maps: FxHashMap<String, Object> = FxHashMap::default();
    let mut statics_of: FxHashMap<String, Object> = FxHashMap::default();

    for definition in &definitions {
        let fail = |message: String| source.fail(message, definition.call.span);
        let evaluate = |object: &ObjectExpression, tables: &Tables| {
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
    // What a create can read of the definitions before it: each earlier create's
    // static styles, added as it is compiled, and every theme, which wins a name
    // it shares with a create.
    let mut local_objects: FxHashMap<String, Value> = theme_maps
        .iter()
        .map(|(name, map)| (name.clone(), Value::obj(map.clone())))
        .collect();
    for definition in definitions.iter().filter(|d| d.method == Method::Create) {
        let fail = |message: String| source.fail(message, definition.call.span);
        let object = object_argument(definition, 0, source, &const_nodes)?;
        let resolver = |key: &str| local_objects.get(key).cloned();
        let evaluator = Evaluator::with_resolver(tables.env(&consts), &resolver).importing(&imports);
        let evaluated = evaluator.object(object).map_err(fail)?;
        let context = Context {
            evaluator,
            const_nodes: &const_nodes,
            source: source.text.unwrap_or_default(),
            base: source.base,
        };
        context.assert_no_dropped_values(object, &evaluated, None).map_err(fail)?;
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
            context.assert_no_dropped_dynamic_values(func.body, &resolved.style).map_err(fail)?;
            let mut sources: Vec<(String, Code)> = runtime
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
        for prop in &object.properties {
            let Some(pair) = as_key_value(prop) else {
                continue;
            };
            let Some(key) = Key::of(pair).name() else {
                continue;
            };
            if let Some(entry) = entries.shift_remove(&key) {
                ordered.insert(key, entry);
            }
        }
        ordered.extend(entries);
        if !theme_maps.contains_key(&definition.name) {
            let mut statics = Object::new();
            for (key, entry) in &ordered {
                if let Entry::Static(style) = entry {
                    statics.insert(key, Value::obj(style.clone()));
                }
            }
            local_objects.insert(definition.name.clone(), Value::obj(statics));
        }
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

    let (exports, reexports) = exported_names(program, &path, options, source.file);
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
        .map(|definition| (definition.init.span().start, definition.init.span().end))
        .collect();
    let mut uses = Vec::new();
    for read in crate::oxc::reads::runtime_reads(program, &skipped) {
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
