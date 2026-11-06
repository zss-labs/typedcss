// The JS output is checked against the CSS extracted from the same file, so that
// every class name and CSS variable the runtime will use has a rule behind it.

use crate::swc::extract::extract_source;
use crate::swc::link::{LinkOptions, link};
use crate::swc::syntax::parse::parse_program;
use crate::swc::transform::{TransformOptions, transform_source};

fn options() -> TransformOptions {
    TransformOptions {
        link: LinkOptions {
            root: "/app".to_string(),
            policy: None,
        },
        style_prop: "sx".to_string(),
        class_prop: "className".to_string(),
    }
}

fn transform(text: &str) -> String {
    transform_source(text, "/app/src/page.tsx", &options()).unwrap_or_else(|error| panic!("{error}"))
}

fn css_of(text: &str) -> String {
    link(&[extract_source(text, "/app/src/page.tsx", &options().link).unwrap()]).unwrap()
}

fn tokens(text: &str, prefix: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut rest = text;
    while let Some(index) = rest.find(prefix) {
        let after = &rest[index..];
        let end = after[prefix.len()..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-'))
            .map_or(after.len(), |end| end + prefix.len());
        found.push(after[..end].to_string());
        rest = &after[end..];
    }
    found
}

const PAGE: &str = r#"'use client';
import * as css from '@typedcss/css';
const pulse = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
export const dark = css.createTheme('.dark', { ink: { default: 'black', theme: 'white' } });
const sizes = css.createStatic({ md: '@media (min-width: 768px)', gap: 8 });
const styles = css.create({
  text: { color: dark.ink, fontSize: 12, ':hover': { color: 'red' } },
  motion: { animationName: pulse, [sizes.md]: { width: sizes.gap } },
  scale: (value) => ({ scale: value }),
  box: ({ width, height: h = 10 }) => ({ width, height: h, margin: width * 2 }),
});
export default function Page({ on, v }) {
  return <main sx={[styles.text, on && styles.motion, styles.scale(v)]}><Child sx={styles.text} /></main>;
}
"#;

#[test]
fn class_names_match_the_documented_output() {
    // the README example, compiled by the previous oxc compiler
    let out = transform(PAGE);
    assert!(out.contains("fontSize: \"xhrr6ses\""), "{out}");
    assert!(out.contains("scale: \"xhxthtyw\""), "{out}");
}

#[test]
fn compiles_definitions_to_runtime_values() {
    let out = transform(PAGE);
    assert!(out.starts_with("'use client';\n"), "{out}");
    assert!(out.contains("import * as css from '@typedcss/css';\nimport { props as __typedcss_props } from \"@typedcss/css\";"), "{out}");
    assert!(out.contains("import * as css from '@typedcss/css';"), "{out}");
    assert!(out.contains("const pulse = \"kf-"), "{out}");
    assert!(out.contains("export const dark = {\n    ink: \"var(--"), "{out}");
    assert!(out.contains("md: \"@media (min-width: 768px)\""), "{out}");
    assert!(out.contains("\"$$css\": true") || out.contains("$$css: true"), "{out}");
    assert!(out.contains("\":hover:color\":"), "{out}");
    assert!(out.contains("scale: (value)=>["), "{out}");
    assert!(out.contains("box: ({ width, height: h } = {})=>["), "{out}");
    assert!(!out.contains("css.create("), "{out}");
    assert!(!out.contains("css.keyframes("), "{out}");
}

#[test]
fn class_style_becomes_a_props_spread_on_elements_only() {
    let out = transform(PAGE);
    assert!(
        out.contains("<main {...__typedcss_props(styles.text, on && styles.motion, styles.scale(v))}>"),
        "{out}"
    );
    assert!(out.contains("<Child sx={styles.text}/>"), "{out}");
}

#[test]
fn output_parses_again() {
    parse_program(&transform(PAGE)).unwrap();
}

#[test]
fn every_class_and_variable_in_the_output_has_css() {
    let out = transform(PAGE);
    let css = css_of(PAGE);
    let classes: Vec<String> = tokens(&out, "\"x")
        .into_iter()
        .map(|token| token.trim_start_matches('"').to_string())
        .collect();
    assert!(classes.len() >= 8, "{out}");
    for class in classes {
        assert!(css.contains(&format!(".{class}")), "{class} missing in\n{css}");
    }
    let variables = tokens(&out, "\"--x");
    assert!(variables.len() >= 4, "{out}");
    for variable in variables {
        let name = variable.trim_start_matches('"');
        assert!(css.contains(&format!("var({name}")), "{name} missing in\n{css}");
    }
}

#[test]
fn dynamic_values_carry_units_and_defaults() {
    let out = transform(PAGE);
    // scale takes no unit, so its value is passed through as it is
    assert!(out.contains("\"--xfuma1qq-value\": value"), "{out}");
    assert!(
        out.contains("\"--xylgo0zz-width\": (typeof (width) === \"number\" ? (width) + \"px\" : (width))"),
        "{out}"
    );
    assert!(out.contains("((width) * 2) + \"px\""), "{out}");
    let css = css_of(PAGE);
    assert!(css.contains(", 10px)"), "{css}");
}

#[test]
fn class_style_with_class_name_is_rejected() {
    let error = transform_source(
        "import * as css from '@typedcss/css';\nconst s = css.create({ a: { color: 'red' } });\nconst A = () => <div className=\"x\" sx={s.a} />;",
        "/app/src/page.tsx",
        &options(),
    )
    .unwrap_err();
    assert!(error.contains("<div> has both sx and className"), "{error}");
    assert!(error.contains("page.tsx:3:"), "{error}");
}

#[test]
fn files_without_plumeria_are_left_as_they_are() {
    let text = "export const a = 1;\nconst B = () => <div className=\"x\" />;\n";
    let out = transform(text);
    assert!(!out.contains("__typedcss_props"), "{out}");
    assert!(out.contains("<div className=\"x\"/>"), "{out}");
}

#[test]
fn property_policy_is_enforced() {
    let mut options = options();
    options.link.policy = Some(crate::policy::PropertyPolicy {
        reject: crate::engine::logical_physical::Spelling::Physical,
        include_axes: false,
    });
    let error = transform_source(
        "import * as css from '@typedcss/css';\nconst s = css.create({ a: { marginLeft: 1 } });",
        "/app/src/page.tsx",
        &options,
    )
    .unwrap_err();
    assert!(error.contains("'marginLeft' is the physical name"), "{error}");
}


#[test]
fn derived_values_keep_defaults_and_signs() {
    let out = transform(
        "import * as css from '@typedcss/css';\nconst s = css.create({ a: (size = 4) => ({ margin: -size, padding: size / 2 + 1 }) });",
    );
    // a default falls back inside the derived value, and a sign stays an operator
    assert!(out.contains("(size) === undefined ? 4 : (size)"), "{out}");
    assert!(out.contains("-("), "{out}");
    parse_program(&out).unwrap();
}


// Solid sets classes through `class`, so the sx spread has to carry that key.
#[test]
fn imports_class_props_when_the_class_prop_is_class() {
    let source = "import * as css from '@typedcss/css';\nconst s = css.create({ a: { color: 'red' } });\nexport const A = () => <div sx={s.a} />;\n";
    let solid = TransformOptions {
        class_prop: "class".to_string(),
        ..options()
    };
    let out = transform_source(source, "/app/src/page.tsx", &solid).unwrap();
    assert!(out.contains("classProps as __typedcss_props"), "{out}");
    assert!(transform(source).contains("props as __typedcss_props"));
    assert!(!transform(source).contains("classProps"));
}
