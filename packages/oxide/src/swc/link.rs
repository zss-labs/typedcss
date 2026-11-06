use indexmap::{IndexMap, IndexSet};
use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};

use crate::engine::{apply_css_value, is_at_rule};
use crate::engine::hash::hash_str;
use crate::js::Value;
use crate::js::number::number_to_string;
use crate::swc::eval::Imports;

pub const VALUE_PREFIX: &str = "--plumeria-link-";
pub const AT_RULE_PREFIX: &str = "@media --plumeria-link-";

const EXTENSIONS: [&str; 8] = [".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"];

#[derive(Clone, Debug, Default)]
pub struct LinkOptions {
    pub root: String,
    pub policy: Option<crate::policy::PropertyPolicy>,
}

fn normalize(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            other => parts.push(other),
        }
    }
    Some(parts.join("/"))
}

fn strip_module_suffix(path: &str) -> String {
    let mut path = path.to_string();
    for extension in EXTENSIONS {
        if let Some(stripped) = path.strip_suffix(extension) {
            path = stripped.to_string();
            break;
        }
    }
    match path.strip_suffix("/index") {
        Some(stripped) => stripped.to_string(),
        None if path == "index" => String::new(),
        None => path,
    }
}

fn relative_to_root(root: &str, file: &str) -> Option<String> {
    let root = root.replace('\\', "/");
    let file = file.replace('\\', "/");
    let root = root.trim_end_matches('/');
    let rest = file.strip_prefix(root)?;
    if !rest.is_empty() && !rest.starts_with('/') {
        return None;
    }
    normalize(rest)
}

pub fn canonical_path(options: &LinkOptions, file: &str) -> Option<String> {
    relative_to_root(&options.root, file).map(|relative| strip_module_suffix(&relative))
}

pub fn resolve_specifier(options: &LinkOptions, importer: &str, specifier: &str) -> Option<String> {
    if specifier.starts_with("./") || specifier.starts_with("../") || specifier == "." || specifier == ".." {
        let importer = relative_to_root(&options.root, importer)?;
        let directory = match importer.rfind('/') {
            Some(index) => &importer[..index],
            None => "",
        };
        return normalize(&format!("{directory}/{specifier}")).map(|path| strip_module_suffix(&path));
    }
    tsconfig_path(&options.root, specifier).or_else(|| {
        let file = crate::fs::resolver::resolve_source_package(specifier, std::path::Path::new(&options.root))?;
        relative_to_root(&options.root, &file.to_string_lossy()).map(|path| strip_module_suffix(&path))
    })
}

fn tsconfig_path(root: &str, specifier: &str) -> Option<String> {
    use crate::fs::resolver::{PathsMatcher, load_paths_matcher, resolve_with_extension};
    use crate::fs::source::{SourceStamp, stamp};
    use std::sync::{Mutex, OnceLock};

    type Cache = FxHashMap<String, (Option<SourceStamp>, Option<PathsMatcher>)>;
    static MATCHERS: OnceLock<Mutex<Cache>> = OnceLock::new();

    if root.is_empty() {
        return None;
    }
    let config = std::path::Path::new(root).join("tsconfig.json");
    let current = stamp(&config.to_string_lossy()).ok();
    let candidates = {
        let mut cache = MATCHERS
            .get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let entry = cache.entry(root.to_string()).or_insert((None, None));
        if entry.0 != current || (current.is_none() && entry.1.is_some()) {
            *entry = (current.clone(), current.as_ref().and_then(|_| load_paths_matcher(&config)));
        }
        entry.1.as_ref()?.candidates(specifier)
    };
    candidates.iter().find_map(|candidate| {
        let file = resolve_with_extension(candidate)?;
        relative_to_root(root, &file).map(|path| strip_module_suffix(&path))
    })
}

pub fn link_key(path: &str, name: &str, member: Option<&str>) -> String {
    match member {
        Some(member) => format!("{path}//{name}.{member}"),
        None => format!("{path}//{name}"),
    }
}

pub fn link_token(key: &str) -> String {
    format!("{VALUE_PREFIX}{}", hash_str(key))
}

pub fn at_rule_token(token: &str) -> Option<String> {
    token
        .strip_prefix(VALUE_PREFIX)
        .map(|hash| format!("{AT_RULE_PREFIX}{hash}"))
}

#[derive(Clone, Debug)]
pub struct ImportEntry {
    pub path: String,
    pub imported: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct ImportTable {
    pub entries: FxHashMap<String, ImportEntry>,
    pub used_keys: std::cell::RefCell<Vec<(String, String)>>,
    pub labels: std::cell::RefCell<Vec<(String, String)>>,
}

impl ImportTable {
    fn labelled(&self, token: String, label: String) -> Value {
        self.labels.borrow_mut().push((token.clone(), label));
        Value::Str(token)
    }
}

fn member_label(object: &str, key: &str) -> String {
    let identifier = key.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
        && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
    if identifier { format!("{object}.{key}") } else { format!("{object}[{key}]") }
}

impl Imports for ImportTable {
    fn name(&self, local: &str) -> Option<Value> {
        let entry = self.entries.get(local)?;
        let imported = entry.imported.as_deref()?;
        Some(self.labelled(link_token(&link_key(&entry.path, imported, None)), local.to_string()))
    }

    fn member(&self, local: &str, key: &str) -> Option<Value> {
        if key.starts_with("var(--") {
            return None;
        }
        let entry = self.entries.get(local)?;
        let token = match entry.imported.as_deref() {
            Some(imported) => link_token(&link_key(&entry.path, imported, Some(key))),
            None => link_token(&link_key(&entry.path, key, None)),
        };
        Some(self.labelled(token, member_label(local, key)))
    }

    fn key_used(&self, token: &str, label: &str) {
        self.used_keys.borrow_mut().push((token.to_string(), label.to_string()));
    }

    fn nested(&self, local: &str, first: &str, second: &str) -> Option<Value> {
        let entry = self.entries.get(local)?;
        if entry.imported.is_some() {
            return None;
        }
        Some(self.labelled(
            link_token(&link_key(&entry.path, first, Some(second))),
            member_label(&member_label(local, first), second),
        ))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Alias {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Default)]
pub struct FileStyles {
    pub path: String,
    pub sheets: Vec<String>,
    /// The CSS of a css.keyframes, css.viewTransitionClass, css.positionTry or
    /// css.varType, under the name it is emitted for. It is emitted only when
    /// that name is used: in the CSS, read at runtime, or in another emitted one.
    pub definitions: Vec<(String, String)>,
    /// The definitions this file reads at runtime, by name or by link token.
    pub uses: Vec<String>,
    pub weighted: Vec<crate::style::escalation::WeightedSheet>,
    pub consts: Vec<(String, String)>,
    pub aliases: Vec<Alias>,
    pub keys: Vec<(String, String)>,
    pub labels: Vec<(String, String)>,
    pub imports: Vec<String>,
}

fn property_before(sheet: &str, index: usize) -> Option<String> {
    let start = sheet[..index].rfind(['{', ';']).map_or(0, |at| at + 1);
    let declaration = sheet[start..index].trim_start();
    let property = declaration.split(':').next()?.trim();
    if property.is_empty() || property.contains(' ') {
        return None;
    }
    let mut out = String::new();
    let mut upper = false;
    for (i, c) in property.chars().enumerate() {
        if c == '-' {
            upper = i > 0;
            continue;
        }
        if upper {
            out.extend(c.to_uppercase());
            upper = false;
        } else {
            out.push(c);
        }
    }
    Some(if property.starts_with("--") { property.to_string() } else { out })
}

fn alias_targets(
    consts: &IndexMap<String, String, FxBuildHasher>,
    alias: &Alias,
) -> Vec<(String, String)> {
    let star = alias.from.ends_with("//*");
    let (from_base, to_base) = if star {
        (
            alias.from.trim_end_matches('*').to_string(),
            alias.to.trim_end_matches('*').to_string(),
        )
    } else {
        (alias.from.clone(), alias.to.clone())
    };
    consts
        .keys()
        .filter_map(|key| {
            let suffix = if star {
                key.strip_prefix(&to_base)?
            } else if key == &to_base {
                ""
            } else {
                key.strip_prefix(&format!("{to_base}."))
                    .map(|_| &key[to_base.len()..])?
            };
            Some((format!("{from_base}{suffix}"), link_token(key)))
        })
        .collect()
}

fn substitute(text: &str, values: &FxHashMap<String, String>, at_rules: bool) -> Result<String, String> {
    let prefix = if at_rules { AT_RULE_PREFIX } else { VALUE_PREFIX };
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(index) = rest.find(prefix) {
        out.push_str(&rest[..index]);
        let after = &rest[index + prefix.len()..];
        let length = after
            .find(|c: char| !c.is_ascii_alphanumeric())
            .unwrap_or(after.len());
        let token = format!("{VALUE_PREFIX}{}", &after[..length]);
        match values.get(&token) {
            Some(value) if at_rules && !value.starts_with('@') => {
                return Err(format!(
                    "[typedcss] An imported value is used as an at-rule key, but it resolves to \"{value}\". Import an at-rule such as \"@media (min-width: 768px)\" for a computed key."
                ));
            }
            Some(value) if !at_rules && after[length..].starts_with(';') => {
                match (declared_property(&out), value.parse::<f64>()) {
                    (Some(property), Ok(number)) if number_to_string(number) == *value => {
                        out.push_str(&apply_css_value(&Value::Num(number), property))
                    }
                    _ => out.push_str(value),
                }
            }
            Some(value) => out.push_str(value),
            None if at_rules => out.push_str(&rest[index..index + prefix.len() + length]),
            None => out.push_str(&token),
        }
        rest = &after[length..];
    }
    out.push_str(rest);
    Ok(out)
}

fn declared_property(before: &str) -> Option<&str> {
    let head = before.strip_suffix(": ")?;
    let start = head
        .rfind(|c: char| c == '{' || c == ';' || c.is_whitespace())
        .map_or(0, |index| index + 1);
    let property = &head[start..];
    (!property.is_empty()).then_some(property)
}

fn resolve_values(files: &[FileStyles]) -> Result<FxHashMap<String, String>, String> {
    let mut consts: IndexMap<String, String, FxBuildHasher> = IndexMap::default();
    for file in files {
        for (key, value) in &file.consts {
            consts.insert(key.clone(), value.clone());
        }
    }
    let mut pending: Vec<&Alias> = files.iter().flat_map(|file| &file.aliases).collect();
    for _ in 0..=pending.len() {
        let mut next = Vec::new();
        for alias in pending {
            let targets = alias_targets(&consts, alias);
            if targets.is_empty() {
                next.push(alias);
                continue;
            }
            for (key, value) in targets {
                consts.entry(key).or_insert(value);
            }
        }
        pending = next;
        if pending.is_empty() {
            break;
        }
    }
    let mut values: FxHashMap<String, String> = consts
        .iter()
        .map(|(key, value)| (link_token(key), value.clone()))
        .collect();
    for _ in 0..=values.len() {
        let mut changed = false;
        let snapshot = values.clone();
        for value in values.values_mut() {
            if value.contains(VALUE_PREFIX) {
                let next = substitute(value, &snapshot, false)?;
                if next != *value {
                    *value = next;
                    changed = true;
                }
            }
        }
        if !changed {
            return Ok(values);
        }
    }
    Err("[typedcss] Imported values refer to each other in a cycle and cannot be resolved.".to_string())
}

fn names(text: &str, name: &str) -> bool {
    text.match_indices(name).any(|(at, _)| {
        let after = text[at + name.len()..].chars().next();
        !after.is_some_and(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    })
}

fn resolved(sheet: &str, values: &FxHashMap<String, String>) -> String {
    let once = substitute(sheet, values, true).unwrap_or_else(|_| sheet.to_string());
    substitute(&once, values, false).unwrap_or(once)
}

// A definition is used when its name appears in the CSS of the styles, is read
// at runtime by a file the build sees, or appears in another used definition.
fn used_definitions<'f>(
    files: &'f [FileStyles],
    values: &FxHashMap<String, String>,
    variants: &[String],
) -> FxHashSet<&'f str> {
    let mut text = String::new();
    for file in files {
        for sheet in &file.sheets {
            text.push_str(&resolved(sheet, values));
        }
        for used in &file.uses {
            text.push_str(values.get(used).map_or(used.as_str(), String::as_str));
            text.push(' ');
        }
    }
    for variant in variants {
        text.push_str(&resolved(variant, values));
    }
    let mut used: FxHashSet<&str> = FxHashSet::default();
    loop {
        let mut added = String::new();
        for file in files {
            for (name, sheet) in &file.definitions {
                if !used.contains(name.as_str()) && names(&text, name) {
                    used.insert(name);
                    added.push_str(&resolved(sheet, values));
                }
            }
        }
        if added.is_empty() {
            return used;
        }
        text.push_str(&added);
    }
}

pub fn link(files: &[FileStyles]) -> Result<String, String> {
    let mut files: Vec<&FileStyles> = files.iter().collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let files: Vec<FileStyles> = files.into_iter().cloned().collect();
    let files = files.as_slice();
    let values = resolve_values(files)?;
    for file in files {
        for (token, label) in &file.keys {
            if !values.contains_key(token) {
                return Err(format!(
                    "[typedcss] Cannot inline the computed key [{label}] at build time. Declare it with css.createStatic, such as const breakpoints = css.createStatic({{ sm: '...' }}), and read it as [breakpoints.sm]. A definition in a package needs to be compiled with the app. ({})",
                    file.path
                ));
            }
        }
    }
    let variants = crate::style::escalation::weighted_variants(files.iter().flat_map(|file| file.weighted.iter()));
    let used = used_definitions(files, &values, &variants);
    let mut sheets: IndexSet<&str, FxBuildHasher> = IndexSet::default();
    for file in files {
        for (name, sheet) in &file.definitions {
            if used.contains(name.as_str()) {
                sheets.insert(sheet);
            }
        }
        for sheet in &file.sheets {
            sheets.insert(sheet);
        }
    }
    for variant in &variants {
        sheets.insert(variant);
    }
    // An atom is written where it is first met, and a conditional one shared
    // with a file sorted earlier would otherwise land ahead of the base rules
    // it has to outrank on a tie.
    let (conditional, base): (Vec<&str>, Vec<&str>) =
        sheets.into_iter().partition(|sheet| is_at_rule(sheet.trim_start()));
    let mut css = String::new();
    for sheet in base.into_iter().chain(conditional) {
        let sheet = substitute(sheet, &values, true)?;
        let sheet = substitute(&sheet, &values, false)?;
        if let Some(index) = sheet.find(VALUE_PREFIX) {
            let length = sheet[index + VALUE_PREFIX.len()..]
                .find(|c: char| !c.is_ascii_alphanumeric())
                .unwrap_or(sheet.len() - index - VALUE_PREFIX.len());
            let token = &sheet[index..index + VALUE_PREFIX.len() + length];
            let owner = files
                .iter()
                .find(|file| {
                    file.sheets.iter().any(|candidate| candidate.contains(token))
                        || file.definitions.iter().any(|(_, candidate)| candidate.contains(token))
                });
            let origin = owner.map(|file| file.path.as_str()).unwrap_or("");
            let label = owner.and_then(|file| file.labels.iter().find(|(candidate, _)| candidate == token));
            if let (Some((_, label)), Some(property)) = (label, property_before(&sheet, index)) {
                return Err(format!(
                    "[typedcss] Cannot resolve the value of \"{property}\" at build time ({label}). Values in css.create must be statically known; pass a runtime value through the function form, css.create({{ name: (value) => ({{ ... }}) }}). ({origin})"
                ));
            }
            return Err(format!(
                "[typedcss] A value imported in {origin} could not be found. Only values exported by a file that imports '@typedcss/css' can be used inside css.create: constants, css.createStatic, css.createTheme, css.keyframes, css.positionTry, css.viewTransitionClass and css.varType."
            ));
        }
        css.push_str(&sheet);
        if !css.ends_with('\n') {
            css.push('\n');
        }
    }
    Ok(css)
}
