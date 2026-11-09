use std::path::{Path, PathBuf};

use rustc_hash::FxHashSet;
use serde_json::Value as Json;

use super::path::{dirname, exists, extname, is_dir, is_file, resolve};

const CONFIG_DIR: &str = "${configDir}";

#[derive(Clone, Debug)]
struct Pattern {
    prefix: String,
    suffix: String,
    wildcard: bool,
    base_path: PathBuf,
    targets: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct PathsMatcher {
    exact: Vec<Pattern>,
    wildcard: Vec<Pattern>,
}

impl PathsMatcher {
    fn new(patterns: Vec<Pattern>) -> Self {
        let exact: Vec<Pattern> = patterns.iter().filter(|p| !p.wildcard).cloned().collect();
        let mut wildcard: Vec<Pattern> = patterns.into_iter().filter(|p| p.wildcard).collect();
        wildcard.sort_by(|a, b| {
            b.prefix
                .encode_utf16()
                .count()
                .cmp(&a.prefix.encode_utf16().count())
        });
        PathsMatcher { exact, wildcard }
    }

    pub fn candidates(&self, specifier: &str) -> Vec<PathBuf> {
        for pattern in &self.exact {
            if pattern.prefix == specifier {
                return pattern
                    .targets
                    .iter()
                    .map(|t| resolve(&pattern.base_path, t))
                    .collect();
            }
        }
        for pattern in &self.wildcard {
            if specifier.len() >= pattern.prefix.len() + pattern.suffix.len()
                && specifier.starts_with(&pattern.prefix)
                && specifier.ends_with(&pattern.suffix)
            {
                let matched =
                    &specifier[pattern.prefix.len()..specifier.len() - pattern.suffix.len()];
                return pattern
                    .targets
                    .iter()
                    .map(|t| resolve(&pattern.base_path, &t.replacen('*', matched, 1)))
                    .collect();
            }
        }
        Vec::new()
    }
}

fn strip_comments(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut in_string = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            if c == '\\' {
                out.push(c);
                if let Some(next) = chars.get(i + 1) {
                    out.push(*next);
                }
                i += 2;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            out.push(c);
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            out.push('\n');
            i += 1;
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                i += 1;
            }
            i += 1;
            out.push(' ');
            i += 1;
            continue;
        }
        out.push(c);
        i += 1;
    }
    out
}

fn strip_trailing_commas(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut in_string = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            if c == '\\' {
                out.push(c);
                if let Some(next) = chars.get(i + 1) {
                    out.push(*next);
                }
                i += 2;
                continue;
            }
            if c == '"' {
                in_string = false;
            }
            out.push(c);
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == ',' {
            let mut next = i + 1;
            while next < chars.len() && chars[next].is_whitespace() {
                next += 1;
            }
            if matches!(chars.get(next), Some('}') | Some(']')) {
                i += 1;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

type Config = std::sync::Arc<serde_json::Map<String, Json>>;

// Every import and every transform reads the same few manifests. Keep each parsed
// one until its stamp changes, the way source::read keeps file text.
fn read_config(path: &Path) -> Option<Config> {
    use std::sync::{Mutex, OnceLock};
    type Cache = rustc_hash::FxHashMap<PathBuf, (super::source::SourceStamp, Config)>;
    static CONFIGS: OnceLock<Mutex<Cache>> = OnceLock::new();
    let configs = CONFIGS.get_or_init(Default::default);

    let Ok(stamp) = super::source::stamp(&path.to_string_lossy()) else {
        configs.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(path);
        return None;
    };
    if let Some((previous, config)) = configs.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).get(path)
        && *previous == stamp
    {
        return Some(config.clone());
    }
    let config = parse_config(path)?;
    let mut cache = configs.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if cache.len() >= 4096 {
        cache.clear();
    }
    cache.insert(path.to_path_buf(), (stamp, config.clone()));
    Some(config)
}

fn parse_config(path: &Path) -> Option<Config> {
    let text = std::fs::read_to_string(path).ok()?;
    let text = text.strip_prefix('\u{feff}').unwrap_or(&text);
    let parsed: Json = serde_json::from_str(&strip_trailing_commas(&strip_comments(text))).ok()?;
    match parsed {
        Json::Object(map) => Some(std::sync::Arc::new(map)),
        _ => None,
    }
}

fn config_file_at(candidate: PathBuf) -> PathBuf {
    if is_dir(&candidate) {
        candidate.join("tsconfig.json")
    } else {
        candidate
    }
}

fn package_name_of(specifier: &str) -> String {
    let segments: Vec<&str> = specifier.split('/').collect();
    if specifier.starts_with('@') {
        segments
            .iter()
            .take(2)
            .copied()
            .collect::<Vec<_>>()
            .join("/")
    } else {
        segments.first().copied().unwrap_or("").to_string()
    }
}

fn exports_target(exports: &Json, subpath: &str) -> Option<String> {
    let pick = |value: &Json| -> Option<String> {
        match value {
            Json::String(target) => Some(target.clone()),
            Json::Object(conditions) => ["require", "node", "default"]
                .iter()
                .find_map(|condition| conditions.get(*condition))
                .and_then(|target| match target {
                    Json::String(target) => Some(target.clone()),
                    _ => None,
                }),
            _ => None,
        }
    };
    match exports {
        Json::String(target) if subpath == "." => Some(target.clone()),
        Json::Object(map) => {
            if map.keys().all(|key| !key.starts_with('.')) {
                return if subpath == "." { pick(exports) } else { None };
            }
            map.get(subpath).and_then(pick)
        }
        _ => None,
    }
}

fn try_file(candidate: &Path) -> Option<PathBuf> {
    if is_file(candidate) {
        return Some(candidate.to_path_buf());
    }
    for extension in [".js", ".json", ".node"] {
        let with = PathBuf::from(format!("{}{extension}", candidate.to_string_lossy()));
        if is_file(&with) {
            return Some(with);
        }
    }
    None
}

fn try_directory(candidate: &Path) -> Option<PathBuf> {
    if !is_dir(candidate) {
        return None;
    }
    if let Some(manifest) = read_config(&candidate.join("package.json"))
        && let Some(Json::String(main)) = manifest.get("main")
    {
        let main_path = candidate.join(main);
        if let Some(found) = try_file(&main_path).or_else(|| try_index(&main_path)) {
            return Some(found);
        }
    }
    try_index(candidate)
}

fn try_index(candidate: &Path) -> Option<PathBuf> {
    for index in ["index.js", "index.json", "index.node"] {
        let path = candidate.join(index);
        if is_file(&path) {
            return Some(path);
        }
    }
    None
}

fn resolve_quietly(specifier: &str, base_path: &Path) -> Option<PathBuf> {
    let package_name = package_name_of(specifier);
    let subpath = if specifier.len() > package_name.len() {
        format!(".{}", &specifier[package_name.len()..])
    } else {
        ".".to_string()
    };
    let mut dir = Some(base_path.to_path_buf());
    while let Some(current) = dir {
        let package_dir = current.join("node_modules").join(&package_name);
        if is_dir(&package_dir) {
            if let Some(manifest) = read_config(&package_dir.join("package.json"))
                && let Some(exports) = manifest.get("exports")
            {
                if let Some(target) = exports_target(exports, &subpath) {
                    let resolved = resolve(&package_dir, &target);
                    return is_file(&resolved).then_some(resolved);
                }
                if subpath != "./package.json" {
                    return None;
                }
            }
            let candidate = if subpath == "." {
                package_dir.clone()
            } else {
                resolve(&package_dir, &subpath)
            };
            if let Some(found) = try_file(&candidate).or_else(|| try_directory(&candidate)) {
                return Some(found);
            }
        }
        dir = current.parent().map(Path::to_path_buf);
    }
    None
}

fn resolve_extends_path(specifier: &str, base_path: &Path) -> Option<PathBuf> {
    if specifier.starts_with('.') || Path::new(specifier).is_absolute() {
        let resolved = config_file_at(resolve(base_path, specifier));
        if is_file(&resolved) {
            return Some(resolved);
        }
        let with_extension = PathBuf::from(format!("{}.json", resolved.to_string_lossy()));
        return is_file(&with_extension).then_some(with_extension);
    }

    let package_name = package_name_of(specifier);
    let exported = || {
        let resolved = resolve_quietly(specifier, base_path)?;
        resolved
            .to_string_lossy()
            .ends_with(".json")
            .then_some(resolved)
    };
    if specifier != package_name {
        return exported();
    }
    let Some(manifest_path) = resolve_quietly(&format!("{package_name}/package.json"), base_path)
    else {
        return exported();
    };
    let manifest = read_config(&manifest_path);
    if manifest.as_ref().is_some_and(|m| m.contains_key("exports"))
        && let Some(resolved) = exported()
    {
        return Some(resolved);
    }
    let package_dir = manifest_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    if let Some(Json::String(declared)) = manifest.as_ref().and_then(|m| m.get("tsconfig")) {
        let declared = config_file_at(resolve(&package_dir, declared));
        if is_file(&declared) {
            return Some(declared);
        }
    }
    let fallback = package_dir.join("tsconfig.json");
    is_file(&fallback).then_some(fallback)
}

fn patterns_of(paths: Option<&Json>, base_path: &Path, entry_path: &Path) -> Option<Vec<Pattern>> {
    let Some(Json::Object(paths)) = paths else {
        return None;
    };
    let mut patterns = Vec::new();
    for (alias, targets) in paths {
        let Json::Array(targets) = targets else {
            continue;
        };
        if targets.is_empty() {
            continue;
        }
        let written: Vec<String> = targets
            .iter()
            .filter_map(|target| match target {
                Json::String(target) => Some(target.clone()),
                _ => None,
            })
            .collect();
        if written.is_empty() {
            continue;
        }
        let star = alias.find('*');
        patterns.push(Pattern {
            prefix: match star {
                Some(index) => alias[..index].to_string(),
                None => alias.clone(),
            },
            suffix: match star {
                Some(index) => alias[index + 1..].to_string(),
                None => String::new(),
            },
            wildcard: star.is_some(),
            base_path: base_path.to_path_buf(),
            targets: written
                .into_iter()
                .map(|target| match target.strip_prefix(CONFIG_DIR) {
                    Some(rest) => entry_path
                        .join(rest.trim_start_matches(['/', '\\']))
                        .to_string_lossy()
                        .into_owned(),
                    None => target,
                })
                .collect(),
        });
    }
    Some(patterns)
}

fn collect_patterns(
    config_path: &Path,
    seen: &mut FxHashSet<PathBuf>,
    entry_path: Option<&Path>,
) -> Option<Vec<Pattern>> {
    if !seen.insert(config_path.to_path_buf()) {
        return None;
    }
    let config = read_config(config_path)?;
    let base_path = config_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    let entry_path = entry_path
        .map(Path::to_path_buf)
        .unwrap_or_else(|| base_path.clone());

    let paths = config
        .get("compilerOptions")
        .and_then(|options| options.get("paths"));
    if let Some(own) = patterns_of(paths, &base_path, &entry_path) {
        return Some(own);
    }

    let inherited: Vec<String> = match config.get("extends") {
        Some(Json::Array(list)) => list
            .iter()
            .rev()
            .filter_map(|item| match item {
                Json::String(text) => Some(text.clone()),
                _ => None,
            })
            .collect(),
        Some(Json::String(text)) if !text.is_empty() => vec![text.clone()],
        _ => Vec::new(),
    };
    for specifier in inherited {
        let Some(resolved) = resolve_extends_path(&specifier, &base_path) else {
            continue;
        };
        if let Some(patterns) = collect_patterns(&resolved, seen, Some(&entry_path)) {
            return Some(patterns);
        }
    }

    if let Some(Json::Array(references)) = config.get("references") {
        for reference in references {
            let Some(Json::String(path)) = reference.get("path") else {
                continue;
            };
            if path.is_empty() {
                continue;
            }
            let target = config_file_at(resolve(&base_path, path));
            if let Some(patterns) = collect_patterns(&target, seen, None) {
                return Some(patterns);
            }
        }
    }
    None
}

pub fn load_paths_matcher(config_path: &Path) -> Option<PathsMatcher> {
    collect_patterns(config_path, &mut FxHashSet::default(), None).map(PathsMatcher::new)
}

const EXTENSIONS: &[&str] = &[
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
];

pub fn resolve_with_extension(base: &Path) -> Option<String> {
    if is_file(base) {
        return Some(base.to_string_lossy().into_owned());
    }
    let text = base.to_string_lossy();
    let extension = extname(&text);
    let replacements: &[&str] = match extension.as_str() {
        ".js" => &[".ts", ".tsx"],
        ".jsx" => &[".tsx"],
        _ => &[],
    };
    for replacement in replacements {
        let candidate = format!("{}{replacement}", &text[..text.len() - extension.len()]);
        if is_file(Path::new(&candidate)) {
            return Some(candidate);
        }
    }
    for extension in EXTENSIONS {
        let candidate = format!("{text}{extension}");
        if is_file(Path::new(&candidate)) {
            return Some(candidate);
        }
    }
    None
}

#[derive(Default)]
pub struct Resolver {
    matcher: Option<Option<PathsMatcher>>,
    loaded_for: Option<PathBuf>,
}

impl Resolver {
    #[cfg(test)]
    pub fn reset(&mut self, cwd: &Path) {
        self.matcher = Some(load_paths_matcher(&cwd.join("tsconfig.json")));
        self.loaded_for = Some(cwd.to_path_buf());
    }

    fn matcher(&mut self) -> Option<&PathsMatcher> {
        let cwd = std::env::current_dir().unwrap_or_default();
        if self.loaded_for.as_ref() != Some(&cwd) {
            self.matcher = None;
            self.loaded_for = Some(cwd.clone());
        }
        if self.matcher.is_none() {
            let config = cwd.join("tsconfig.json");
            self.matcher = Some(if exists(&config) {
                load_paths_matcher(&config)
            } else {
                None
            });
        }
        self.matcher.as_ref().and_then(Option::as_ref)
    }

    pub fn resolve_import_path(&mut self, import_path: &str, importer: &str) -> Option<String> {
        if import_path == "@typedcss/css" {
            return None;
        }
        if import_path.starts_with('.') {
            return resolve_with_extension(&resolve(Path::new(&dirname(importer)), import_path));
        }
        if let Some(matcher) = self.matcher() {
            for candidate in matcher.candidates(import_path) {
                if let Some(result) = resolve_with_extension(&candidate) {
                    return Some(result);
                }
            }
        }
        let mut current = PathBuf::from(dirname(importer));
        loop {
            let root = current
                .ancestors()
                .last()
                .map(Path::to_path_buf)
                .unwrap_or_default();
            if current == root || current.as_os_str().is_empty() {
                return None;
            }
            if exists(&current.join("package.json")) {
                if let Some(file) = resolve_source_package(import_path, &current) {
                    return Some(file.to_string_lossy().into_owned());
                }
                return resolve_with_extension(&resolve(&current, import_path));
            }
            match current.parent() {
                Some(parent) => current = parent.to_path_buf(),
                None => return None,
            }
        }
    }
}

pub const SOURCE_CONDITION: &str = "typedcss";

fn source_target_of(entry: &Json) -> Option<String> {
    match entry {
        Json::Object(conditions) => match conditions.get(SOURCE_CONDITION)? {
            Json::String(target) => Some(target.clone()),
            _ => None,
        },
        _ => None,
    }
}

fn source_target(exports: &Json, subpath: &str) -> Option<String> {
    let map = match exports {
        Json::Object(map) if map.keys().any(|key| key.starts_with('.')) => map,
        other if subpath == "." => return source_target_of(other),
        _ => return None,
    };
    if let Some(entry) = map.get(subpath) {
        return source_target_of(entry);
    }
    let (key, matched) = map
        .keys()
        .filter_map(|key| {
            let (prefix, suffix) = key.split_once('*')?;
            (!suffix.contains('*')
                && subpath.len() >= key.len()
                && subpath.starts_with(prefix)
                && subpath.ends_with(suffix))
            .then(|| (key, &subpath[prefix.len()..subpath.len() - suffix.len()]))
        })
        .max_by_key(|(key, _)| (key.find('*').unwrap_or(0), key.len()))?;
    Some(source_target_of(map.get(key)?)?.replace('*', matched))
}

pub fn resolve_source_package(specifier: &str, root: &Path) -> Option<PathBuf> {
    if specifier.starts_with('.') || specifier.starts_with('/') {
        return None;
    }
    let name = package_name_of(specifier);
    let subpath = match specifier.get(name.len()..) {
        Some(rest) if !rest.is_empty() => format!(".{rest}"),
        _ => ".".to_string(),
    };
    let app = read_config(&root.join("package.json"))?;
    let declared = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
        .iter()
        .any(|field| matches!(app.get(*field), Some(Json::Object(map)) if map.contains_key(&name)));
    if !declared {
        return None;
    }
    let dir = root.join("node_modules").join(&name);
    let manifest = read_config(&dir.join("package.json"))?;
    let target = source_target(manifest.get("exports")?, &subpath)?;
    let resolved = resolve(&dir, &target);
    resolve_with_extension(&resolved).map(PathBuf::from)
}

pub struct SourcePackage {
    pub name: String,
    pub dir: PathBuf,
    pub exports: Json,
    pub source_dirs: Vec<PathBuf>,
}

fn source_dirs_of(dir: &Path, exports: &Json) -> Vec<PathBuf> {
    let entries: Vec<&Json> = match exports {
        Json::Object(map) if map.keys().any(|key| key.starts_with('.')) => map.values().collect(),
        other => vec![other],
    };
    let mut dirs: Vec<PathBuf> = Vec::new();
    for target in entries.into_iter().filter_map(source_target_of) {
        let source_dir = match target.find('*') {
            None => resolve(dir, &target).parent().map(Path::to_path_buf),
            Some(star) if target[..star].ends_with('/') => Some(resolve(dir, &target[..star])),
            Some(star) => resolve(dir, &target[..star]).parent().map(Path::to_path_buf),
        };
        if let Some(source_dir) = source_dir.filter(|source_dir| source_dir.starts_with(dir))
            && !dirs.contains(&source_dir)
        {
            dirs.push(source_dir);
        }
    }
    let nested = |candidate: &PathBuf| dirs.iter().any(|other| other != candidate && candidate.starts_with(other));
    dirs.iter().filter(|candidate| !nested(candidate)).cloned().collect()
}

/// The dependencies of the app at `root` that point the typedcss condition at their
/// source. `dir` is the package as the app sees it under node_modules, and
/// `source_dirs` holds each source directory both there and at its real path,
/// so a bundler that follows symlinks finds the file under either.
pub fn source_packages(root: &Path) -> Vec<SourcePackage> {
    let Some(app) = read_config(&root.join("package.json")) else {
        return Vec::new();
    };
    let mut names: Vec<&String> = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
        .iter()
        .filter_map(|field| match app.get(*field) {
            Some(Json::Object(map)) => Some(map.keys()),
            _ => None,
        })
        .flatten()
        .collect();
    names.sort();
    names.dedup();
    names
        .into_iter()
        .filter_map(|name| {
            let dir = resolve(root, &format!("node_modules/{name}"));
            let exports = read_config(&dir.join("package.json"))?.get("exports")?.clone();
            let linked = source_dirs_of(&dir, &exports);
            if linked.is_empty() {
                return None;
            }
            let mut source_dirs = linked.clone();
            if let Ok(real) = std::fs::canonicalize(&dir)
                && real != dir
            {
                for source_dir in &linked {
                    if let Ok(rest) = source_dir.strip_prefix(&dir) {
                        source_dirs.push(real.join(rest));
                    }
                }
            }
            Some(SourcePackage {
                name: name.clone(),
                dir,
                exports,
                source_dirs,
            })
        })
        .collect()
}

/// Changes whenever the app manifest or a dependency manifest under node_modules
/// changes, so a file whose imports went through a source package is extracted
/// again when that package starts pointing the typedcss condition elsewhere.
pub fn source_packages_stamp(root: &Path) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = rustc_hash::FxHasher::default();
    let manifest = root.join("package.json");
    let stamp_of = |path: &Path| super::source::stamp(&path.to_string_lossy()).ok();
    stamp_of(&manifest).hash(&mut hasher);
    if let Some(app) = read_config(&manifest) {
        for field in ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] {
            if let Some(Json::Object(map)) = app.get(field) {
                for name in map.keys() {
                    name.hash(&mut hasher);
                    stamp_of(&root.join("node_modules").join(name).join("package.json")).hash(&mut hasher);
                }
            }
        }
    }
    hasher.finish()
}
