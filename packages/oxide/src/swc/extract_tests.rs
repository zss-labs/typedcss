// Each file is extracted on its own, without reading any other file; `link` then
// joins the results and replaces the cross-file placeholders.

use crate::swc::extract::extract_source;
use crate::swc::link::{FileStyles, LinkOptions, VALUE_PREFIX, link};

fn options() -> LinkOptions {
    LinkOptions {
        root: "/app".to_string(),
        policy: None,
    }
}

fn extract(file: &str, text: &str) -> FileStyles {
    extract_source(text, file, &options()).unwrap_or_else(|error| panic!("{file}: {error}"))
}

const TOKENS: &str = r#"
import * as css from '@typedcss/css';
export const space = 8;
export const breakpoints = css.createStatic({ md: '@media (min-width: 768px)', unit: 'rem' });
export const theme = css.createTheme('.dark', { accent: { default: 'tomato', theme: 'salmon' }, gap: { default: '4px', theme: '8px' } });
export const fade = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
export const anchor = css.positionTry({ positionArea: 'top' });
export const angle = css.varType({ syntax: '<angle>', inherits: false, initialValue: '0deg' });
const local = css.keyframes({ from: { color: 'red' } });
"#;

const PAGE: &str = r#"
import * as css from '@typedcss/css';
import { space, breakpoints, theme, fade, anchor, angle } from '../tokens';
export const styles = css.create({
  box: {
    color: theme.accent,
    padding: space,
    animationName: fade,
    positionTryFallbacks: anchor,
    [angle]: '45deg',
    [breakpoints.md]: { width: 100 },
  },
});
"#;

#[test]
fn local_definitions_emit_their_css() {
    let file = extract(
        "/app/src/local.tsx",
        r#"
import * as css from '@typedcss/css';
const pulse = css.keyframes({ from: { opacity: 0 } });
const dark = css.createTheme('.dark', { ink: { default: 'black', theme: 'white' } });
const styles = css.create({
  a: { color: dark.ink, animationName: pulse, ':hover': { color: 'red' } },
  grow: (size) => ({ width: size, '@media (min-width: 600px)': { height: size * 2 } }),
});
"#,
    );
    let css = link(&[file]).unwrap();
    assert!(css.contains("@keyframes kf-"), "{css}");
    assert!(css.contains(".dark"), "{css}");
    assert!(css.contains(":hover"), "{css}");
    assert!(css.contains("@media (min-width: 600px)"), "{css}");
    assert!(css.contains("width: var(--"), "{css}");
    assert!(!css.contains(VALUE_PREFIX), "{css}");
}

#[test]
fn imported_values_are_linked_across_files() {
    let tokens = extract("/app/src/tokens.ts", TOKENS);
    let page = extract("/app/src/app/page.tsx", PAGE);
    // the page only knows placeholders for its imports
    assert!(page.sheets.iter().any(|sheet| sheet.contains(VALUE_PREFIX)));
    let css = link(&[page.clone(), tokens.clone()]).unwrap();
    assert!(!css.contains(VALUE_PREFIX), "{css}");
    assert!(css.contains("color: var(--"), "{css}");
    assert!(css.contains("padding: 8px"), "{css}");
    assert!(css.contains("--x") && css.contains(": tomato"), "{css}");
    assert!(css.contains("animation-name: kf-"), "{css}");
    assert!(css.contains("position-try-fallbacks: --pt-"), "{css}");
    assert!(css.contains("--pr-"), "{css}");
    assert!(css.contains("@media (min-width: 768px)"), "{css}");
    assert!(css.contains("@property --pr-"), "{css}");
    // the order of files does not matter
    assert_eq!(css, link(&[tokens, page]).unwrap());
}

#[test]
fn page_class_names_do_not_depend_on_the_imported_values() {
    let page = extract("/app/src/app/page.tsx", PAGE);
    let changed = extract("/app/src/tokens.ts", &TOKENS.replace("tomato", "navy"));
    let original = extract("/app/src/tokens.ts", TOKENS);
    let before = link(&[page.clone(), original]).unwrap();
    let after = link(&[page.clone(), changed]).unwrap();
    assert_ne!(before, after);
    let classes = |css: &str| -> Vec<String> {
        css.lines()
            .filter(|line| line.starts_with(".x"))
            .map(|line| line.split([':', ' ']).next().unwrap().to_string())
            .collect()
    };
    let page_classes: Vec<String> = classes(&before)
        .into_iter()
        .filter(|class| page.sheets.iter().any(|sheet| sheet.contains(class.as_str())))
        .collect();
    assert!(!page_classes.is_empty());
    for class in &page_classes {
        assert!(after.contains(class.as_str()), "{class}");
    }
}

#[test]
fn reexports_resolve() {
    let tokens = extract("/app/src/tokens.ts", TOKENS);
    let barrel = extract(
        "/app/src/index.ts",
        "export { theme as colors, space } from './tokens';\nexport * from './tokens';",
    );
    let page = extract(
        "/app/src/app/page.tsx",
        r#"
import * as css from '@typedcss/css';
import { colors, fade } from '../index';
import * as all from '../index';
const styles = css.create({ a: { color: colors.accent, animationName: fade, margin: all.space } });
"#,
    );
    let css = link(&[page, barrel, tokens]).unwrap();
    assert!(!css.contains(VALUE_PREFIX), "{css}");
    assert!(css.contains("animation-name: kf-"), "{css}");
    assert!(css.contains("margin: 8px"), "{css}");
}

#[test]
fn index_files_and_extensions_share_one_path() {
    let tokens = extract("/app/src/tokens/index.ts", TOKENS);
    let page = extract(
        "/app/src/page.tsx",
        "import * as css from '@typedcss/css';\nimport { space } from './tokens/index.ts';\nconst s = css.create({ a: { margin: space } });",
    );
    assert!(link(&[page, tokens]).unwrap().contains("margin: 8px"));
}

#[test]
fn unresolved_imports_are_reported() {
    let page = extract(
        "/app/src/page.tsx",
        "import * as css from '@typedcss/css';\nimport { missing } from './nowhere';\nconst s = css.create({ a: { color: missing } });",
    );
    let error = link(&[page]).unwrap_err();
    assert!(error.contains("src/page"), "{error}");
}

#[test]
fn imported_non_at_rules_cannot_be_keys() {
    let tokens = extract("/app/src/tokens.ts", TOKENS);
    let page = extract(
        "/app/src/page.tsx",
        "import * as css from '@typedcss/css';\nimport { breakpoints } from './tokens';\nconst s = css.create({ a: { [breakpoints.unit]: { width: 1 } } });",
    );
    let error = link(&[page, tokens]).unwrap_err();
    assert!(error.contains("at-rule"), "{error}");
}

#[test]
fn arithmetic_on_imported_values_is_an_error() {
    let error = extract_source(
        "import * as css from '@typedcss/css';\nimport { space } from './tokens';\nconst s = css.create({ a: { margin: space * 2 } });",
        "/app/src/page.tsx",
        &options(),
    )
    .unwrap_err();
    assert!(error.contains("requires numeric operands"), "{error}");
    assert!(error.contains("page.tsx:3:"), "{error}");
}

#[test]
fn definitions_must_be_top_level() {
    let error = extract_source(
        "import * as css from '@typedcss/css';\nfunction f() { const s = css.create({ a: { color: 'red' } }); }",
        "/app/src/page.tsx",
        &options(),
    )
    .unwrap_err();
    assert!(error.contains("must be assigned to a top-level variable"), "{error}");
}

#[test]
fn package_imports_are_not_linked() {
    let error = extract_source(
        "import * as css from '@typedcss/css';\nimport { size } from 'some-package';\nconst s = css.create({ a: { margin: `${size}px` } });",
        "/app/src/page.tsx",
        &options(),
    )
    .unwrap_err();
    assert!(error.contains("Cannot resolve static value: size"), "{error}");
}
