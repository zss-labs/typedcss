use crate::engine::transpile_global;
use crate::style::escalation::weighted_sheets_of;
use crate::style::records::{StyleRecord, style_records};
use crate::js::{Object, Value};
use crate::style::theme::{create_position_try, create_theme, create_var_type, create_view_transition};
use crate::oxc::link::{FileStyles, LinkOptions};
use crate::oxc::model::{Entry, Method, Model, Source, analyze, definition_name};
use crate::oxc::syntax::parse::parse_program;

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

fn entry_style(entry: &Entry) -> &Object {
    match entry {
        Entry::Static(style) => style,
        Entry::Dynamic { style, .. } => style,
    }
}

/// The unweighted style records of every create entry, indexed by create, then entry.
pub fn entry_records(model: &Model) -> Vec<Vec<Vec<StyleRecord>>> {
    model
        .creates
        .values()
        .map(|styles| {
            styles
                .entries
                .values()
                .map(|entry| style_records(entry_style(entry), None))
                .collect()
        })
        .collect()
}

pub fn file_styles(model: &Model) -> FileStyles {
    file_styles_with(model, &entry_records(model))
}

pub fn file_styles_with(model: &Model, records: &[Vec<Vec<StyleRecord>>]) -> FileStyles {
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
    for (styles, records) in model.creates.values().zip(records) {
        for (entry, records) in styles.entries.values().zip(records) {
            let style = entry_style(entry);
            sheets.extend(records.iter().map(|record| record.sheet.clone()));
            weighted.extend(weighted_sheets_of(style, records));
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
    let allocator = oxc_allocator::Allocator::default();
    let parsed = parse_program(&allocator, text)?;
    let source = Source::new(text, parsed.base, file);
    let model = analyze(&parsed.program, &source, options)?;
    Ok(file_styles(&model))
}
