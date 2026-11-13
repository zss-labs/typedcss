use rustc_hash::FxHashMap;
use oxc_allocator::{Allocator, CloneIn, Vec as ArenaVec};
use oxc_ast::ast::*;
use oxc_ast::builder::AstBuilder;
use oxc_ast_visit::{Visit, VisitMut, walk, walk_mut};
use oxc_codegen::Codegen;
use oxc_span::{GetSpan, SPAN, Span};
use oxc_str::JSStr;
use oxc_syntax::scope::ScopeFlags;

use crate::js::{Object, Value};
use crate::style::records::{StyleRecord, atom_map_of};
use crate::oxc::extract::{entry_records, file_styles_with};
use crate::oxc::fold::{Folded, Part, StaticStyles};
use crate::oxc::link::{FileStyles, LinkOptions};
use crate::oxc::model::{Code, Entry, Method, Source, analyze};
use crate::oxc::syntax::module::CORE;
use crate::oxc::syntax::parse::parse_program;

pub const DEFAULT_STYLE_PROP: &str = "sx";
pub const PROPS_LOCAL: &str = "__typedcss_props";
const MAP_LOCAL: &str = "__typedcss_map";
pub const CSS_MARKER: &str = "$$css";
pub const WEIGHT_MARKER: &str = "$$w";

#[derive(Clone, Debug)]
pub struct TransformOptions {
    pub link: LinkOptions,
    pub style_prop: String,
    pub class_prop: String,
}

struct FindStyleProp<'s> {
    style_prop: &'s str,
    found: bool,
}

impl<'a> Visit<'a> for FindStyleProp<'_> {
    fn visit_jsx_attribute(&mut self, attr: &JSXAttribute<'a>) {
        if let JSXAttributeName::Identifier(name) = &attr.name
            && name.name == self.style_prop
        {
            self.found = true;
            return;
        }
        walk::walk_jsx_attribute(self, attr);
    }
}

pub fn needs_transform(program: &Program, style_prop: &str) -> bool {
    let imports_core = program
        .body
        .iter()
        .any(|item| matches!(item, Statement::ImportDeclaration(decl) if decl.source.value == CORE));
    if imports_core {
        return true;
    }
    let mut finder = FindStyleProp {
        style_prop,
        found: false,
    };
    finder.visit_program(program);
    finder.found
}

/// Builds the JS the transform writes in place of the compiled definitions.
struct Build<'a> {
    ast: AstBuilder<'a>,
}

impl<'a> Build<'a> {
    fn ident(&self, name: &str) -> Ident<'a> {
        Ident::from_str_in(name, &self.ast)
    }

    fn str_expr(&self, text: &str) -> Expression<'a> {
        Expression::new_string_literal(SPAN, JSStr::from_str_in(text, &self.ast), None, &self.ast)
    }

    fn bool_expr(&self, value: bool) -> Expression<'a> {
        Expression::new_boolean_literal(SPAN, value, &self.ast)
    }

    fn num_expr(&self, number: f64) -> Expression<'a> {
        let positive = Expression::new_numeric_literal(SPAN, number.abs(), None, NumberBase::Decimal, &self.ast);
        if number.is_sign_negative() && number != 0.0 {
            Expression::new_unary_expression(SPAN, UnaryOperator::UnaryNegation, positive, &self.ast)
        } else {
            positive
        }
    }

    fn ident_expr(&self, name: &str) -> Expression<'a> {
        Expression::new_identifier(SPAN, self.ident(name), &self.ast)
    }

    fn key(&self, text: &str) -> PropertyKey<'a> {
        let is_identifier = text
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
            && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
        if is_identifier {
            PropertyKey::new_static_identifier(SPAN, self.ident(text), &self.ast)
        } else {
            PropertyKey::from(self.str_expr(text))
        }
    }

    fn pair(&self, name: &str, value: Expression<'a>) -> ObjectPropertyKind<'a> {
        ObjectPropertyKind::new_object_property(
            SPAN,
            PropertyKind::Init,
            self.key(name),
            value,
            false,
            false,
            false,
            &self.ast,
        )
    }

    fn object_expr(&self, props: impl IntoIterator<Item = ObjectPropertyKind<'a>>) -> Expression<'a> {
        Expression::new_object_expression(SPAN, ArenaVec::from_iter_in(props, &self.ast), &self.ast)
    }

    fn array_expr(&self, items: impl IntoIterator<Item = Expression<'a>>) -> Expression<'a> {
        let elements = ArenaVec::from_iter_in(items.into_iter().map(ArrayExpressionElement::from), &self.ast);
        Expression::new_array_expression(SPAN, elements, &self.ast)
    }

    fn value_expr(&self, value: &Value) -> Expression<'a> {
        match value {
            Value::Str(text) => self.str_expr(text),
            Value::Num(number) => self.num_expr(*number),
            Value::Bool(flag) => self.bool_expr(*flag),
            Value::Obj(object) => {
                self.object_expr(object.iter().map(|(name, value)| self.pair(name, self.value_expr(value))))
            }
            _ => Expression::new_null_literal(SPAN, &self.ast),
        }
    }

    fn code_expr(&self, code: &Code) -> Expression<'a> {
        let ast = &self.ast;
        match code {
            Code::Ident(name) => self.ident_expr(name),
            Code::Str(text) => self.str_expr(text),
            Code::Num(number) => self.num_expr(*number),
            Code::Paren(inner) => Expression::new_parenthesized_expression(SPAN, self.code_expr(inner), ast),
            Code::Binary(left, op, right) => {
                let (left, right) = (self.code_expr(left), self.code_expr(right));
                match op.operator() {
                    Ok(operator) => Expression::new_binary_expression(SPAN, left, operator, right, ast),
                    Err(operator) => Expression::new_logical_expression(SPAN, left, operator, right, ast),
                }
            }
            Code::Unary(op, argument) => {
                Expression::new_unary_expression(SPAN, op.operator(), self.code_expr(argument), ast)
            }
            Code::Cond(test, cons, alt) => Expression::new_conditional_expression(
                SPAN,
                self.code_expr(test),
                self.code_expr(cons),
                self.code_expr(alt),
                ast,
            ),
        }
    }

    fn class_map(&self, style: &Object, records: &[StyleRecord]) -> Expression<'a> {
        let mut props: Vec<ObjectPropertyKind<'a>> = atom_map_of(records)
            .iter()
            .map(|(slot, class)| self.pair(slot, self.value_expr(class)))
            .collect();
        let atoms = crate::style::escalation::state_atoms(style);
        if !atoms.is_empty() {
            let weights = atoms.iter().map(|atom| {
                let mut entry = vec![
                    self.str_expr(&atom.group),
                    self.array_expr(atom.base.iter().map(|n| self.num_expr(*n as f64))),
                ];
                if !atom.covers.is_empty() {
                    entry.push(self.array_expr(atom.covers.iter().map(|p| self.str_expr(p))));
                }
                self.pair(&atom.key, self.array_expr(entry))
            });
            props.push(self.pair(WEIGHT_MARKER, self.object_expr(weights)));
        }
        props.push(self.pair(CSS_MARKER, self.bool_expr(true)));
        self.object_expr(props)
    }

    fn param(&self, pattern: BindingPattern<'a>, initializer: Option<Expression<'a>>) -> FormalParameter<'a> {
        FormalParameter::new(
            SPAN,
            ArenaVec::new_in(&self.ast),
            pattern,
            None,
            initializer.map(|init| oxc_allocator::Box::new_in(init, &self.ast)),
            false,
            None,
            false,
            false,
            &self.ast,
        )
    }

    fn binding(&self, name: &str) -> BindingPattern<'a> {
        BindingPattern::new_binding_identifier(SPAN, self.ident(name), &self.ast)
    }

    fn entry_expr(&self, entry: &Entry, records: &[StyleRecord]) -> Expression<'a> {
        let ast = &self.ast;
        let (params, named, style, vars) = match entry {
            Entry::Static(style) => return self.class_map(style, records),
            Entry::Dynamic {
                params,
                named,
                style,
                vars,
            } => (params, named, style, vars),
        };
        let params: Vec<FormalParameter<'a>> = match named {
            Some(named) => {
                let props = named.iter().map(|param| {
                    BindingProperty::new(
                        SPAN,
                        self.key(&param.key),
                        self.binding(&param.local),
                        param.key == param.local,
                        false,
                        ast,
                    )
                });
                let pattern = BindingPattern::new_object_pattern(SPAN, ArenaVec::from_iter_in(props, ast), None, ast);
                vec![self.param(pattern, Some(self.object_expr([])))]
            }
            None => params.iter().map(|param| self.param(self.binding(param), None)).collect(),
        };
        let var_props = vars.iter().map(|var| self.pair(&var.css_var, self.code_expr(&var.value)));
        let body = self.array_expr([self.ident_expr(MAP_LOCAL), self.object_expr(var_props)]);
        let function = self.arrow(params, body);
        let outer = self.arrow(vec![self.param(self.binding(MAP_LOCAL), None)], function);
        let map = Argument::from(self.class_map(style, records));
        Expression::new_call_expression(SPAN, outer, None, ArenaVec::from_array_in([map], ast), false, ast)
    }

    fn arrow(&self, params: Vec<FormalParameter<'a>>, body: Expression<'a>) -> Expression<'a> {
        let ast = &self.ast;
        let params = FormalParameters::boxed(
            SPAN,
            FormalParameterKind::ArrowFormalParameters,
            ArenaVec::from_iter_in(params, ast),
            None,
            ast,
        );
        Expression::new_arrow_function_expression(SPAN, false, None, params, None, ArrowFunctionBody::from(body), ast)
    }

    fn props_import(&self, class_prop: &str) -> Statement<'a> {
        let ast = &self.ast;
        let imported = if class_prop == "class" { "classProps" } else { "props" };
        let specifier = ImportDeclarationSpecifier::new_import_specifier(
            SPAN,
            ModuleExportName::new_identifier_name(SPAN, imported, ast),
            BindingIdentifier::new(SPAN, PROPS_LOCAL, ast),
            ImportOrExportKind::Value,
            ast,
        );
        Statement::new_import_declaration(
            SPAN,
            Some(ArenaVec::from_array_in([specifier], ast)),
            StringLiteral::new(SPAN, CORE, None, ast),
            None,
            None,
            ImportOrExportKind::Value,
            ast,
        )
    }
}

fn span_key(span: Span) -> (u32, u32) {
    (span.start, span.end)
}

struct ReplaceInits<'a> {
    plan: FxHashMap<(u32, u32), Expression<'a>>,
}

impl<'a> VisitMut<'a> for ReplaceInits<'a> {
    fn visit_variable_declarator(&mut self, it: &mut VariableDeclarator<'a>) {
        if let Some(init) = &mut it.init
            && let Some(replacement) = self.plan.remove(&span_key(init.span()))
        {
            *init = replacement;
            return;
        }
        walk_mut::walk_variable_declarator(self, it);
    }
}

fn attr_name<'b>(attr: &'b JSXAttributeItem<'b>) -> Option<&'b str> {
    match attr {
        JSXAttributeItem::Attribute(attr) => match &attr.name {
            JSXAttributeName::Identifier(name) => Some(name.name.as_str()),
            _ => None,
        },
        _ => None,
    }
}

struct StyleProp<'s, 'a> {
    allocator: &'a Allocator,
    build: &'s Build<'a>,
    style_prop: &'s str,
    class_prop: &'s str,
    static_styles: &'s StaticStyles,
    functions: u32,
    source: &'s Source<'s>,
    used: bool,
    error: Option<String>,
}

impl<'a> StyleProp<'_, 'a> {
    fn arguments(&self, value: JSXAttributeValue<'a>) -> ArenaVec<'a, Argument<'a>> {
        let ast = &self.build.ast;
        let JSXAttributeValue::ExpressionContainer(container) = value else {
            return ArenaVec::new_in(ast);
        };
        let mut inner = match container.unbox().expression {
            JSXExpression::EmptyExpression(_) => return ArenaVec::new_in(ast),
            expression => expression.into_expression(),
        };
        while let Expression::ParenthesizedExpression(paren) = inner {
            inner = paren.unbox().expression;
        }
        match inner {
            Expression::ArrayExpression(array) => {
                let elements = array.unbox().elements.into_iter().filter_map(|element| match element {
                    ArrayExpressionElement::Elision(_) => None,
                    ArrayExpressionElement::SpreadElement(spread) => Some(Argument::SpreadElement(spread)),
                    element => Some(Argument::from(element.into_expression())),
                });
                ArenaVec::from_iter_in(elements, ast)
            }
            other => ArenaVec::from_array_in([Argument::from(other)], ast),
        }
    }

    fn class_attribute(&self, class_prop: &str, class_name: &str) -> JSXAttributeItem<'a> {
        let ast = &self.build.ast;
        JSXAttributeItem::new_attribute(
            SPAN,
            JSXAttributeName::new_identifier(SPAN, self.build.ident(class_prop), ast),
            Some(JSXAttributeValue::new_string_literal(SPAN, JSStr::from_str_in(class_name, ast), None, ast)),
            ast,
        )
    }

    /// Plumeria's className expression: the parts joined with `+ " " +`.
    fn folded_attribute(&self, class_prop: &str, folded: Folded<'_, 'a>) -> Option<JSXAttributeItem<'a>> {
        let parts = match folded {
            Folded::Static(class_name) if class_name.is_empty() => return None,
            Folded::Static(class_name) => return Some(self.class_attribute(class_prop, &class_name)),
            Folded::Dynamic(parts) => parts,
        };
        let ast = &self.build.ast;
        let test = |test: &Expression<'a>| {
            Expression::new_parenthesized_expression(SPAN, test.clone_in(self.allocator), ast)
        };
        let expressions = parts.into_iter().map(|part| match part {
            Part::Text(text) => self.build.str_expr(&text),
            Part::Ternary { test: condition, truthy, falsy } => Expression::new_parenthesized_expression(
                SPAN,
                Expression::new_conditional_expression(
                    SPAN,
                    test(condition),
                    self.build.str_expr(&truthy),
                    self.build.str_expr(&falsy),
                    ast,
                ),
                ast,
            ),
            Part::Lookup { tests, entries, fallback } => {
                let key = tests
                    .into_iter()
                    .map(|condition| {
                        Expression::new_parenthesized_expression(
                            SPAN,
                            Expression::new_conditional_expression(
                                SPAN,
                                test(condition),
                                self.build.str_expr("1"),
                                self.build.str_expr("0"),
                                ast,
                            ),
                            ast,
                        )
                    })
                    .reduce(|left, right| {
                        let left = Expression::new_binary_expression(SPAN, left, BinaryOperator::Addition, self.build.str_expr("__"), ast);
                        Expression::new_binary_expression(SPAN, left, BinaryOperator::Addition, right, ast)
                    })
                    .expect("a lookup has at least one test");
                let table = self.build.object_expr(entries.iter().map(|(key, class_name)| {
                    ObjectPropertyKind::new_object_property(
                        SPAN,
                        PropertyKind::Init,
                        PropertyKey::from(self.build.str_expr(key)),
                        self.build.str_expr(class_name),
                        false,
                        false,
                        false,
                        ast,
                    )
                }));
                let table = Expression::new_parenthesized_expression(SPAN, table, ast);
                let lookup = Expression::new_computed_member_expression(SPAN, table, key, false, ast);
                Expression::new_parenthesized_expression(
                    SPAN,
                    Expression::new_logical_expression(SPAN, lookup, LogicalOperator::Or, self.build.str_expr(&fallback), ast),
                    ast,
                )
            }
        });
        let class_name = expressions
            .reduce(|left, right| {
                let left = Expression::new_binary_expression(SPAN, left, BinaryOperator::Addition, self.build.str_expr(" "), ast);
                Expression::new_binary_expression(SPAN, left, BinaryOperator::Addition, right, ast)
            })?;
        let value = JSXAttributeValue::new_expression_container(SPAN, JSXExpression::from(class_name), ast);
        Some(JSXAttributeItem::new_attribute(
            SPAN,
            JSXAttributeName::new_identifier(SPAN, self.build.ident(class_prop), ast),
            Some(value),
            ast,
        ))
    }

    fn function_in(&self, attr: &JSXAttributeItem<'a>) -> Option<String> {
        let JSXAttributeItem::Attribute(attr) = attr else {
            return None;
        };
        let Some(JSXAttributeValue::ExpressionContainer(container)) = &attr.value else {
            return None;
        };
        self.uncompiled_in(vec![container.expression.as_expression()?], true)
    }

    fn uncompiled_in(&self, mut pending: Vec<&Expression<'a>>, functions: bool) -> Option<String> {
        while let Some(expr) = pending.pop() {
            match expr {
                Expression::ParenthesizedExpression(paren) => pending.push(&paren.expression),
                Expression::ArrayExpression(array) => pending.extend(array.elements.iter().filter_map(|element| {
                    match element {
                        ArrayExpressionElement::Elision(_) => None,
                        ArrayExpressionElement::SpreadElement(spread) => Some(&spread.argument),
                        element => element.as_expression(),
                    }
                })),
                Expression::ConditionalExpression(cond) => pending.extend([&cond.consequent, &cond.alternate]),
                Expression::LogicalExpression(logical) => pending.push(&logical.right),
                Expression::ObjectExpression(_) => {
                    return Some(self.source.fail("[typedcss] Inline style objects are not accepted.".to_string(), expr.span()));
                }
                Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) if functions => {
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

impl<'a> VisitMut<'a> for StyleProp<'_, 'a> {
    fn visit_call_expression(&mut self, it: &mut CallExpression<'a>) {
        if self.error.is_none() && self.static_styles.props_callee(&it.callee).is_some() {
            let arguments = it.arguments.iter().filter_map(|argument| match argument {
                Argument::SpreadElement(spread) => Some(&spread.argument),
                argument => argument.as_expression(),
            });
            self.error = self.uncompiled_in(arguments.collect(), false);
        }
        walk_mut::walk_call_expression(self, it);
    }

    fn visit_function(&mut self, it: &mut Function<'a>, flags: ScopeFlags) {
        self.functions += 1;
        walk_mut::walk_function(self, it, flags);
        self.functions -= 1;
    }

    fn visit_arrow_function_expression(&mut self, it: &mut ArrowFunctionExpression<'a>) {
        self.functions += 1;
        walk_mut::walk_arrow_function_expression(self, it);
        self.functions -= 1;
    }

    fn visit_jsx_opening_element(&mut self, it: &mut JSXOpeningElement<'a>) {
        walk_mut::walk_jsx_opening_element(self, it);
        if self.error.is_some() {
            return;
        }
        let deferred = self.functions > 0;
        let mut index = 0;
        while index < it.attributes.len() {
            let folded = match &it.attributes[index] {
                JSXAttributeItem::SpreadAttribute(spread) => self
                    .static_styles
                    .spread_class_name(&spread.argument, deferred)
                    .map(|(folded, class_prop)| self.folded_attribute(class_prop, folded)),
                JSXAttributeItem::Attribute(_) => None,
            };
            match folded {
                Some(None) => {
                    it.attributes.remove(index);
                    continue;
                }
                Some(Some(attribute)) => it.attributes[index] = attribute,
                None => {}
            }
            index += 1;
        }
        let JSXElementName::Identifier(name) = &it.name else {
            return;
        };
        if !name.name.starts_with(|c: char| c.is_ascii_lowercase()) {
            return;
        }
        let Some(index) = it
            .attributes
            .iter()
            .position(|attr| attr_name(attr) == Some(self.style_prop))
        else {
            return;
        };
        if let Some(other) = it
            .attributes
            .iter()
            .filter_map(attr_name)
            .find(|name| *name == "className" || *name == "style")
        {
            self.error = Some(self.source.fail(
                format!(
                    "[typedcss] <{}> has both {} and {other}. css.props sets className and style itself, so write the extra classes or inline styles as styles in {}.",
                    name.name,
                    self.style_prop,
                    self.style_prop
                ),
                it.attributes[index].span(),
            ));
            return;
        }
        if let Some(function) = self.function_in(&it.attributes[index]) {
            self.error = Some(function);
            return;
        }
        let folded = match &it.attributes[index] {
            JSXAttributeItem::Attribute(attr) => attr
                .value
                .as_ref()
                .and_then(|value| self.static_styles.class_name(value, self.functions > 0))
                .map(|folded| self.folded_attribute(self.class_prop, folded)),
            JSXAttributeItem::SpreadAttribute(_) => None,
        };
        match folded {
            Some(None) => {
                it.attributes.remove(index);
                return;
            }
            Some(Some(attribute)) => {
                it.attributes[index] = attribute;
                return;
            }
            None => {}
        }
        let JSXAttributeItem::Attribute(attr) = it.attributes.remove(index) else {
            unreachable!()
        };
        let ast = &self.build.ast;
        let args = attr.unbox().value.map(|value| self.arguments(value)).unwrap_or_else(|| ArenaVec::new_in(ast));
        let call = Expression::new_call_expression(SPAN, self.build.ident_expr(PROPS_LOCAL), None, args, false, ast);
        it.attributes.insert(index, JSXAttributeItem::new_spread_attribute(SPAN, call, ast));
        self.used = true;
    }
}

fn import_end(program: &Program) -> usize {
    program
        .body
        .iter()
        .take_while(|item| matches!(item, Statement::ImportDeclaration(_)))
        .count()
}

pub fn transform_module<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    source: &Source,
    options: &TransformOptions,
) -> Result<FileStyles, String> {
    let build = Build {
        ast: AstBuilder::new(allocator),
    };
    let before = crate::oxc::elide::referenced(program);
    let mut plan: FxHashMap<(u32, u32), Expression<'a>> = FxHashMap::default();
    let (styles, static_styles) = {
        let model = analyze(program, source, &options.link)?;
        let records = entry_records(&model);
        for definition in &model.definitions {
            let replacement = match definition.method {
                Method::Create => {
                    let Some((index, _, styles)) = model.creates.get_full(&definition.name) else {
                        continue;
                    };
                    build.object_expr(
                        styles
                            .entries
                            .iter()
                            .zip(&records[index])
                            .map(|((name, entry), records)| build.pair(name, build.entry_expr(entry, records))),
                    )
                }
                _ => match model.runtime_values.get(&definition.name) {
                    Some(value) => build.value_expr(value),
                    None => continue,
                },
            };
            plan.insert(span_key(definition.init.span()), replacement);
        }
        (file_styles_with(&model, &records), StaticStyles::new(program, &model, &records))
    };
    program.body.retain(|item| match item {
        Statement::ExpressionStatement(statement) => plan.remove(&span_key(statement.expression.span())).is_none(),
        _ => true,
    });
    ReplaceInits { plan }.visit_program(program);

    let mut style_prop = StyleProp {
        allocator,
        build: &build,
        style_prop: &options.style_prop,
        class_prop: &options.class_prop,
        static_styles: &static_styles,
        functions: 0,
        source,
        used: false,
        error: None,
    };
    style_prop.visit_program(program);
    if let Some(error) = style_prop.error {
        return Err(error);
    }
    static_styles.remove_unused(program);
    crate::oxc::elide::elide_imports(program, &before, CORE);
    if style_prop.used {
        let at = import_end(program);
        program.body.insert(at, build.props_import(&options.class_prop));
    }
    Ok(styles)
}

pub fn print_module(program: &Program) -> String {
    Codegen::new().build(program).code
}

#[cfg(test)]
pub fn transform_source(text: &str, file: &str, options: &TransformOptions) -> Result<String, String> {
    let allocator = Allocator::default();
    let mut parsed = parse_program(&allocator, text)?;
    let source = Source::new(text, parsed.base, file);
    transform_module(&allocator, &mut parsed.program, &source, options)?;
    Ok(print_module(&parsed.program))
}

pub fn transform_if_needed(text: &str, file: &str, options: &TransformOptions) -> Result<Option<String>, String> {
    let allocator = Allocator::default();
    let mut parsed = parse_program(&allocator, text)?;
    if !needs_transform(&parsed.program, &options.style_prop) {
        return Ok(None);
    }
    let source = Source::new(text, parsed.base, file);
    let styles = transform_module(&allocator, &mut parsed.program, &source, options)?;
    crate::stylesheet::remember(file, text, &options.link, styles);
    Ok(Some(print_module(&parsed.program)))
}
