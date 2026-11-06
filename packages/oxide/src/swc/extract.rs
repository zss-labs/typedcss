use crate::engine::transpile_global;
use crate::js::{Object, Value};
use crate::style::theme::{create_position_try, create_theme, create_var_type, create_view_transition};
use crate::swc::link::{FileStyles, LinkOptions};
use crate::swc::model::{Entry, Method, Model, Source, analyze, definition_name};
use crate::swc::syntax::parse::parse_program;

fn global_sheet(kind: Method, hash: &str, object: &Object, selector: &str) -> String {
    match kind {
        Method::Keyframes => {
            let mut wrapper = Object::new();
            wrapper.insert(format!("@keyframes kf-{hash}"), Value::obj(object.clone()));
            transpile_global(&wrapper)
        }
        Method::ViewTransitionClass => transpile_global(&create_view_transition(object, hash)),
        Method::PositionTry => transpile_global(&create_position_try(object, hash)),
        Method::VarType => transpile_global(&create_var_type(object, hash)),
        Method::CreateTheme => transpile_global(&create_theme(selector, object, hash)),
        Method::Create | Method::CreateStatic => String::new(),
    }
}

pub fn file_styles(model: &Model) -> FileStyles {
    let mut sheets = Vec::new();
    let mut definitions = Vec::new();
    let mut weighted = Vec::new();
    for global in model.globals.values() {
        let sheet = global_sheet(global.kind, &global.hash, &global.object, &global.selector);
        if sheet.is_empty() {
            continue;
        }
        match definition_name(global) {
            Some(name) => definitions.push((name, sheet)),
            None => sheets.push(sheet),
        }
    }
    for styles in model.creates.values() {
        for entry in styles.entries.values() {
            let style = match entry {
                Entry::Static(style) => style,
                Entry::Dynamic { style, .. } => style,
            };
            for record in crate::style::records::style_records(style, None) {
                sheets.push(record.sheet);
            }
            weighted.extend(crate::style::escalation::weighted_sheets(style));
        }
    }
    FileStyles {
        path: model.path.clone(),
        sheets,
        definitions,
        uses: model.uses.clone(),
        weighted,
        consts: model.link_values.clone(),
        aliases: model.reexports.clone(),
        keys: model.imports.used_keys.borrow().clone(),
        labels: model.imports.labels.borrow().clone(),
        imports: model
            .imports
            .entries
            .values()
            .map(|entry| entry.path.clone())
            .chain(model.reexports.iter().filter_map(|alias| alias.to.split_once("//").map(|(path, _)| path.to_string())))
            .collect(),
    }
}

pub fn extract_source(text: &str, file: &str, options: &LinkOptions) -> Result<FileStyles, String> {
    let parsed = parse_program(text)?;
    let source = Source::new(text, parsed.base, file);
    let model = analyze(&parsed.module, &source, options)?;
    Ok(file_styles(&model))
}
