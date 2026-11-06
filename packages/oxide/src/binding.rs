use napi::{Error, Result};
use napi_derive::napi;
use serde_json::Value;
use crate::api::{DEFAULT_STYLE_PROP, LinkOptions, TransformOptions, compile, transform_if_needed};

fn transform_options(options: &Value) -> std::result::Result<TransformOptions, String> {
    Ok(TransformOptions {
        link: LinkOptions {
            root: options["root"].as_str().unwrap_or_default().to_string(),
            policy: crate::policy::property_policy_of(options)?,
        },
        style_prop: options["styleProp"].as_str().unwrap_or(DEFAULT_STYLE_PROP).to_string(),
        class_prop: options["classProp"].as_str().unwrap_or("className").to_string(),
    })
}

#[napi]
pub fn transform(source: String, filename: String, options: Option<Value>) -> Result<Option<String>> {
    let options = transform_options(&options.unwrap_or(Value::Null)).map_err(Error::from_reason)?;
    transform_if_needed(&source, &filename, &options).map_err(Error::from_reason)
}

#[napi]
pub fn compile_css(request: Value) -> Result<String> {
    compile(&request).map_err(Error::from_reason)
}

fn to_json(value: &crate::js::Value) -> Value {
    match value {
        crate::js::Value::Str(text) => Value::String(text.clone()),
        crate::js::Value::Num(number) => serde_json::Number::from_f64(*number).map(Value::Number).unwrap_or(Value::Null),
        crate::js::Value::Bool(flag) => Value::Bool(*flag),
        crate::js::Value::Null => Value::Null,
        crate::js::Value::Obj(object) => {
            Value::Object(object.iter().map(|(key, value)| (key.to_string(), to_json(value))).collect())
        }
    }
}

#[napi(js_name = "sourcePackages")]
pub fn source_packages(root: String) -> Vec<Value> {
    let root = crate::fs::path::resolve(&std::env::current_dir().unwrap_or_default(), &root);
    crate::fs::resolver::source_packages(&root)
        .into_iter()
        .map(|package| {
            serde_json::json!({
                "name": package.name,
                "dir": package.dir.to_string_lossy(),
                "exports": package.exports,
                "sourceDirs": package
                    .source_dirs
                    .iter()
                    .map(|dir| dir.to_string_lossy().into_owned())
                    .collect::<Vec<_>>(),
            })
        })
        .collect()
}

#[napi(js_name = "resolveImportPath")]
pub fn resolve_import_path(import_path: String, importer: String) -> Option<String> {
    crate::swc::values::resolve_import_path(&import_path, &importer)
}

#[napi(js_name = "resolveExportValue")]
pub fn resolve_export_value(file_path: String, export_name: String) -> Option<Value> {
    crate::swc::values::resolve_export_value(&file_path, &export_name).map(|value| to_json(&value))
}

fn from_json(value: &Value) -> crate::js::Value {
    match value {
        Value::String(text) => crate::js::Value::Str(text.clone()),
        Value::Number(number) => crate::js::Value::Num(number.as_f64().unwrap_or_default()),
        Value::Bool(flag) => crate::js::Value::Bool(*flag),
        Value::Object(map) => crate::js::Value::Obj(std::sync::Arc::new(object_of(map))),
        _ => crate::js::Value::Null,
    }
}

fn object_of(map: &serde_json::Map<String, Value>) -> crate::js::Object {
    let mut object = crate::js::Object::new();
    for (key, value) in map {
        object.insert(key, from_json(value));
    }
    object
}

fn object_arg(value: &Value) -> crate::js::Object {
    match value {
        Value::Object(map) => object_of(map),
        _ => crate::js::Object::new(),
    }
}

#[napi(js_name = "getStyleRecords")]
pub fn get_style_records(style: Value) -> Vec<Value> {
    crate::style::records::style_records(&object_arg(&style), None)
        .into_iter()
        .map(|record| serde_json::json!({ "key": record.key, "hash": record.hash, "sheet": record.sheet }))
        .collect()
}

#[napi(js_name = "themeHashOf")]
pub fn theme_hash_of(selector: String, rule: Value) -> String {
    crate::style::theme::theme_hash_of(&selector, &object_arg(&rule))
}

#[napi(js_name = "createTheme")]
pub fn create_theme(selector: String, rule: Value, theme_hash: String) -> Value {
    let object = crate::style::theme::create_theme(&selector, &object_arg(&rule), &theme_hash);
    to_json(&crate::js::Value::Obj(std::sync::Arc::new(object)))
}

#[napi]
pub fn optimizer(css_code: String) -> Result<String> {
    let minify = std::env::var("NODE_ENV").is_ok_and(|mode| mode == "production");
    crate::optimize::optimize(&css_code, minify).map_err(Error::from_reason)
}

#[napi(js_name = "needsCompile")]
pub fn needs_compile(source: String, style_prop: String, file_path: String) -> bool {
    crate::filter::needs_compile(&source, &style_prop, &file_path)
}

#[napi(js_name = "resolvePropertyPolicy")]
pub fn resolve_property_policy(options: Option<Value>) -> Result<Option<Value>> {
    let policy = crate::policy::property_policy_of(&options.unwrap_or(Value::Null)).map_err(Error::from_reason)?;
    Ok(policy.map(|policy| {
        let reject = match policy.reject {
            crate::engine::logical_physical::Spelling::Logical => "logical",
            crate::engine::logical_physical::Spelling::Physical => "physical",
        };
        serde_json::json!({ "reject": reject, "includeAxes": policy.include_axes })
    }))
}

#[napi(js_name = "globFiles")]
pub fn glob_files(include: Vec<String>, cwd: String, exclude: Vec<String>) -> Result<Vec<String>> {
    crate::fs::glob::glob_sync(
        &include,
        crate::fs::glob::GlobOptions {
            cwd: std::path::Path::new(&cwd),
            exclude: &exclude,
            expected_files: 0,
        },
    )
    .map_err(Error::from_reason)
}
