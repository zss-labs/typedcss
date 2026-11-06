use std::sync::Mutex;

use serde_json::json;

use crate::api::{DEFAULT_STYLE_PROP, LinkOptions, TransformOptions, compile, transform_if_needed};

// The cache is process-wide and compile evicts unlisted paths, so tests run one at a time.
static SERIAL: Mutex<()> = Mutex::new(());

const SOURCE: &str = r#"import * as css from '@typedcss/css';
const styles = css.create({ box: { padding: 8, color: 'red' } });
export const Box = () => <div sx={styles.box} />;
"#;

fn options() -> TransformOptions {
    TransformOptions {
        link: LinkOptions { root: "/app".into(), policy: None },
        style_prop: DEFAULT_STYLE_PROP.into(),
        class_prop: "className".to_string(),
    }
}

fn request(path: &str, source: &str) -> serde_json::Value {
    json!({ "root": "/app", "files": [{ "path": path, "source": source }] })
}

// Styles kept by transform must produce the same sheet as a fresh extraction.
#[test]
fn reuses_styles_from_transform() {
    let _serial = SERIAL.lock().unwrap_or_else(|p| p.into_inner());
    let cold = compile(&request("/app/cold.tsx", SOURCE)).unwrap();
    transform_if_needed(SOURCE, "/app/warm.tsx", &options()).unwrap().unwrap();
    let warm = compile(&request("/app/warm.tsx", SOURCE)).unwrap();
    assert_eq!(cold, warm);
    assert!(warm.contains("padding"));
}

// A source that changed after transform is extracted again, not served stale.
#[test]
fn reextracts_changed_source() {
    let _serial = SERIAL.lock().unwrap_or_else(|p| p.into_inner());
    transform_if_needed(SOURCE, "/app/changed.tsx", &options()).unwrap().unwrap();
    let changed = SOURCE.replace("'red'", "'blue'");
    let css = compile(&request("/app/changed.tsx", &changed)).unwrap();
    assert!(css.contains("blue"));
    assert!(!css.contains("red"));
}

// A file transformed earlier can be listed by path alone.
#[test]
fn accepts_path_only_after_transform() {
    let _serial = SERIAL.lock().unwrap_or_else(|p| p.into_inner());
    transform_if_needed(SOURCE, "/app/path-only.tsx", &options()).unwrap().unwrap();
    let css = compile(&json!({ "root": "/app", "files": [{ "path": "/app/path-only.tsx" }] })).unwrap();
    assert!(css.contains("padding"));
}

// A conditional atom shared with a file sorted earlier still follows the base
// rules of every file, so it keeps outranking them on a tie.
#[test]
fn writes_shared_conditional_atoms_after_base_rules() {
    let _serial = SERIAL.lock().unwrap_or_else(|p| p.into_inner());
    let condition = r#"import * as css from '@typedcss/css';
export const a = css.create({ box: { '@media (min-width: 600px)': { padding: 40 } } });
"#;
    let target = r#"import * as css from '@typedcss/css';
export const b = css.create({ box: { paddingBlock: 4, '@media (min-width: 600px)': { padding: 40 } } });
"#;
    let css = compile(&json!({ "root": "/app", "files": [
        { "path": "/app/a.styles.ts", "source": condition },
        { "path": "/app/b.styles.ts", "source": target },
    ] }))
    .unwrap();
    let base = css.find("padding-block").unwrap();
    let media = css.find("@media").unwrap();
    assert!(base < media, "{css}");
}
