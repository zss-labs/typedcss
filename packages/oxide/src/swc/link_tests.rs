use super::link::{LinkOptions, resolve_specifier};

// Imports written against tsconfig `paths` resolve the same way the TypeScript
// compiler and the bundler read them.
fn project(paths: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "typedcss-link-{}-{}",
        std::process::id(),
        paths.len()
    ));
    std::fs::create_dir_all(dir.join("src/app")).unwrap();
    std::fs::write(dir.join("src/app/tokens.ts"), "export const a = 1;\n").unwrap();
    std::fs::write(
        dir.join("tsconfig.json"),
        format!(r#"{{ "compilerOptions": {{ "baseUrl": ".", "paths": {paths} }} }}"#),
    )
    .unwrap();
    std::fs::canonicalize(dir).unwrap()
}

fn options(root: &std::path::Path) -> LinkOptions {
    LinkOptions {
        root: root.to_string_lossy().into_owned(),
        policy: None,
    }
}

#[test]
fn resolves_through_tsconfig_paths() {
    let root = project(r#"{ "@/*": ["./src/*"] }"#);
    let importer = root.join("src/app/page.tsx").to_string_lossy().into_owned();

    assert_eq!(
        resolve_specifier(&options(&root), &importer, "@/app/tokens"),
        Some("src/app/tokens".to_string())
    );
    assert_eq!(resolve_specifier(&options(&root), &importer, "@/app/missing"), None);
    assert_eq!(resolve_specifier(&options(&root), &importer, "react"), None);
}
