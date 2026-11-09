use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_span::GetSpan;

use super::expr::{E, K, Prop, expression_label, root_identifier, unwrap};
use super::module::{Aliases, SpecKind, add_core_aliases, import_source, import_specs, plumeria_method};
use super::parse::{parse_expression_text, parse_object_text, parse_program};
use super::visit::{expression_has_identifier, jsx_openings, reads_names_expr};

fn first_expr<'b>(program: &'b Program<'b>) -> &'b Expression<'b> {
    match &program.body[0] {
        Statement::ExpressionStatement(stmt) => &stmt.expression,
        _ => panic!("expected an expression statement"),
    }
}

#[test]
fn parses_tsx_and_slices_text_by_offset() {
    let allocator = Allocator::default();
    let source = "const a = <div classStyle={[s.a]} />;\nfoo(1 as number);";
    let parsed = parse_program(&allocator, source).unwrap();
    let Statement::ExpressionStatement(stmt) = &parsed.program.body[1] else {
        panic!("expected a call statement");
    };
    assert_eq!(parsed.base.text(source, stmt.expression.span()), "foo(1 as number)");
    assert_eq!(parsed.base.start(stmt.expression.span()), 38);
}

#[test]
fn reports_syntax_errors() {
    let allocator = Allocator::default();
    assert!(parse_program(&allocator, "const = ;").is_err());
}

#[test]
fn unwraps_parens_casts_and_optional_chains() {
    let allocator = Allocator::default();
    let parsed = parse_program(&allocator, "((x as any)!)?.a.b;").unwrap();
    let e = unwrap(E::new(first_expr(&parsed.program)));
    assert!(e.is_member());
    assert_eq!(expression_label(e), "x.a.b");
    assert_eq!(root_identifier(e), Some("x"));
    match e.prop() {
        Some(Prop::Name(name)) => assert_eq!(name, "b"),
        _ => panic!("expected a named property"),
    }
}

#[test]
fn optional_calls_read_like_calls() {
    let allocator = Allocator::default();
    let parsed = parse_program(&allocator, "styles.fn?.(1, ...rest);").unwrap();
    let e = unwrap(E::new(first_expr(&parsed.program)));
    let call = e.call().expect("an optional call is a call");
    assert_eq!(call.args.len(), 2);
    assert!(call.has_spread());
    assert_eq!(root_identifier(e), Some("styles"));
}

#[test]
fn classifies_literals() {
    let allocator = Allocator::default();
    let expr = parse_expression_text(&allocator, "[`a${b}`, 'x', 1.5, true, null, a && b]").unwrap();
    let Expression::ArrayExpression(array) = &expr else {
        panic!("expected an array");
    };
    let kinds: Vec<&str> = array
        .elements
        .iter()
        .map(|elem| match E::new(elem.as_expression().unwrap()).kind() {
            K::Template(_) => "template",
            K::Str(_) => "str",
            K::Num(_) => "num",
            K::Bool(true) => "true",
            K::Null => "null",
            K::Binary(_, op, _) if op.is_and() => "and",
            _ => "other",
        })
        .collect();
    assert_eq!(kinds, ["template", "str", "num", "true", "null", "and"]);
}

#[test]
fn parses_object_text() {
    let allocator = Allocator::default();
    let object = parse_object_text(&allocator, "({ color: 'red', ...rest })").unwrap();
    assert_eq!(object.properties.len(), 2);
    assert!(parse_object_text(&allocator, "[1]").is_none());
}

#[test]
fn reads_import_specifiers_and_core_methods() {
    let allocator = Allocator::default();
    let parsed = parse_program(
        &allocator,
        "import css, { create as c, type Style, 'use' as u } from '@typedcss/css';\nimport * as ns from '@typedcss/css';",
    )
    .unwrap();
    let mut aliases = Aliases::default();
    for item in &parsed.program.body {
        let Statement::ImportDeclaration(decl) = item else {
            continue;
        };
        assert_eq!(import_source(decl), "@typedcss/css");
        add_core_aliases(decl, &mut aliases);
    }
    let Statement::ImportDeclaration(decl) = &parsed.program.body[0] else {
        panic!("expected an import");
    };
    let specs = import_specs(decl);
    assert!(specs[0].kind == SpecKind::Default);
    assert_eq!((specs[1].local, specs[1].imported.as_str()), ("c", "create"));
    assert!(specs[2].type_only);
    assert_eq!(specs[3].imported, "use");

    let call = parse_expression_text(&allocator, "ns.create").unwrap();
    assert_eq!(plumeria_method(&call, &aliases), Some("create"));
    let call = parse_expression_text(&allocator, "c").unwrap();
    assert_eq!(plumeria_method(&call, &aliases), Some("create"));
    let call = parse_expression_text(&allocator, "other.create").unwrap();
    assert_eq!(plumeria_method(&call, &aliases), None);
}

#[test]
fn reads_names_skip_keys_members_and_types() {
    let allocator = Allocator::default();
    let reads = |text: &'static str, name: &'static str| {
        let expr = parse_expression_text(&allocator, text).unwrap();
        reads_names_expr(&expr, &|candidate| candidate == name)
    };
    assert!(reads("{ width: size }", "size"));
    assert!(reads("{ size }", "size"));
    assert!(!reads("{ size: 1 }", "size"));
    assert!(!reads("a.size", "size"));
    assert!(reads("a[size]", "size"));
    assert!(!reads("(x: size) => x", "size"));
    assert!(!reads("<div />", "div"));
    assert!(reads("<Box />", "Box"));

    let expr = parse_expression_text(&allocator, "{ size: 1 }").unwrap();
    assert!(expression_has_identifier(&expr, &|name| name == "size"));
}

#[test]
fn collects_jsx_openings_in_order() {
    let allocator = Allocator::default();
    let parsed = parse_program(&allocator, "const a = <A><B /><C>{<D />}</C></A>;").unwrap();
    let names: Vec<String> = jsx_openings(&parsed.program)
        .iter()
        .map(|opening| match &opening.name {
            JSXElementName::IdentifierReference(ident) => ident.name.to_string(),
            _ => String::new(),
        })
        .collect();
    assert_eq!(names, ["A", "B", "C", "D"]);
}
