use napi::bindgen_prelude::{Either, Undefined};
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

// Only declares the type the generated index.d.ts gives this argument.
#[allow(dead_code)]
#[napi(object, object_from_js = false, object_to_js = false)]
pub struct SizesOption {
    pub sizes: Option<bool>,
}

// Only declares the type the generated index.d.ts gives this argument.
#[allow(dead_code)]
#[napi(object, object_from_js = false, object_to_js = false)]
pub struct PropertyPolicyOptions {
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_logical_properties: Option<Value>,
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_physical_properties: Option<Value>,
}

// Only declares the type the generated index.d.ts gives this argument.
#[allow(dead_code)]
#[napi(object, object_from_js = false, object_to_js = false)]
pub struct OxideOptions {
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_logical_properties: Option<Value>,
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_physical_properties: Option<Value>,
    pub root: Option<String>,
    pub style_prop: Option<String>,
    #[napi(ts_type = "'className' | 'class'")]
    pub class_prop: Option<String>,
}

// Only declares the type the generated index.d.ts gives this argument.
#[allow(dead_code)]
#[napi(object, object_from_js = false, object_to_js = false)]
pub struct StyleFile {
    pub path: String,
    pub source: Option<String>,
}

// Only declares the type the generated index.d.ts gives this argument.
#[allow(dead_code)]
#[napi(object, object_from_js = false, object_to_js = false)]
pub struct CompileRequest {
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_logical_properties: Option<Value>,
    #[napi(ts_type = "boolean | SizesOption")]
    pub without_physical_properties: Option<Value>,
    pub root: Option<String>,
    pub files: Vec<StyleFile>,
}

#[napi(object)]
pub struct SourcePackage {
    pub name: String,
    pub dir: String,
    #[napi(ts_type = "unknown")]
    pub exports: Value,
    pub source_dirs: Vec<String>,
}

#[napi(object)]
pub struct PropertyPolicy {
    #[napi(ts_type = "'logical' | 'physical'")]
    pub reject: String,
    pub include_axes: bool,
}

#[napi(ts_args_type = "source: string, filename: string, options?: OxideOptions")]
pub fn transform(source: String, filename: String, options: Option<Value>) -> Result<Option<String>> {
    let options = transform_options(&options.unwrap_or(Value::Null)).map_err(Error::from_reason)?;
    transform_if_needed(&source, &filename, &options).map_err(Error::from_reason)
}

#[napi(ts_args_type = "request: CompileRequest")]
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
pub fn source_packages(root: String) -> Vec<SourcePackage> {
    let root = crate::fs::path::resolve(&std::env::current_dir().unwrap_or_default(), &root);
    crate::fs::resolver::source_packages(&root)
        .into_iter()
        .map(|package| SourcePackage {
            name: package.name,
            dir: package.dir.to_string_lossy().into_owned(),
            exports: package.exports,
            source_dirs: package
                .source_dirs
                .iter()
                .map(|dir| dir.to_string_lossy().into_owned())
                .collect(),
        })
        .collect()
}

#[napi(js_name = "resolveImportPath")]
pub fn resolve_import_path(import_path: String, importer: String) -> Option<String> {
    crate::swc::values::resolve_import_path(&import_path, &importer)
}

#[napi(js_name = "resolveExportValue", ts_return_type = "unknown")]
pub fn resolve_export_value(file_path: String, export_name: String) -> Either<Value, Undefined> {
    crate::swc::values::resolve_export_value(&file_path, &export_name)
        .map(|value| to_json(&value))
        .into()
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

#[napi(object)]
pub struct StyleRecord {
    pub key: String,
    pub hash: String,
    pub sheet: String,
}

#[napi(js_name = "getStyleRecords", ts_args_type = "style: object")]
pub fn get_style_records(style: Value) -> Vec<StyleRecord> {
    crate::style::records::style_records(&object_arg(&style), None)
        .into_iter()
        .map(|record| StyleRecord {
            key: record.key,
            hash: record.hash,
            sheet: record.sheet,
        })
        .collect()
}

#[napi(js_name = "themeHashOf", ts_args_type = "selector: string, rule: object")]
pub fn theme_hash_of(selector: String, rule: Value) -> String {
    crate::style::theme::theme_hash_of(&selector, &object_arg(&rule))
}

#[napi(
    js_name = "createTheme",
    ts_args_type = "selector: string, rule: object, themeHash: string",
    ts_return_type = "Record<string, any>"
)]
pub fn create_theme(selector: String, rule: Value, theme_hash: String) -> Value {
    let object = crate::style::theme::create_theme(&selector, &object_arg(&rule), &theme_hash);
    to_json(&crate::js::Value::Obj(std::sync::Arc::new(object)))
}

#[napi(ts_args_type = "css: string")]
pub fn optimizer(css_code: String) -> Result<String> {
    let minify = std::env::var("NODE_ENV").is_ok_and(|mode| mode == "production");
    crate::optimize::optimize(&css_code, minify).map_err(Error::from_reason)
}

#[napi(js_name = "needsCompile")]
pub fn needs_compile(source: String, style_prop: String, file_path: String) -> bool {
    crate::filter::needs_compile(&source, &style_prop, &file_path)
}

#[napi(
    js_name = "resolvePropertyPolicy",
    ts_args_type = "options?: PropertyPolicyOptions",
    ts_return_type = "PropertyPolicy | undefined"
)]
pub fn resolve_property_policy(options: Option<Value>) -> Result<Either<PropertyPolicy, Undefined>> {
    let policy = crate::policy::property_policy_of(&options.unwrap_or(Value::Null)).map_err(Error::from_reason)?;
    Ok(policy
        .map(|policy| PropertyPolicy {
            reject: match policy.reject {
                crate::engine::logical_physical::Spelling::Logical => "logical",
                crate::engine::logical_physical::Spelling::Physical => "physical",
            }
            .to_string(),
            include_axes: policy.include_axes,
        })
        .into())
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
