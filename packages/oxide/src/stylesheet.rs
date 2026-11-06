use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use rustc_hash::{FxHashMap, FxHashSet, FxHasher};

use crate::swc::extract::extract_source;
use crate::swc::link::{FileStyles, LinkOptions, link};

struct Cached {
    source: u64,
    options: u64,
    styles: FileStyles,
}

static CACHE: Mutex<Option<FxHashMap<String, Cached>>> = Mutex::new(None);

fn fingerprint(value: impl Hash) -> u64 {
    let mut hasher = FxHasher::default();
    value.hash(&mut hasher);
    hasher.finish()
}

fn options_fingerprint(options: &LinkOptions) -> u64 {
    let packages = if options.root.is_empty() {
        0
    } else {
        crate::fs::resolver::source_packages_stamp(std::path::Path::new(&options.root))
    };
    fingerprint((&options.root, format!("{:?}", options.policy), packages))
}

fn with_cache<T>(f: impl FnOnce(&mut FxHashMap<String, Cached>) -> T) -> T {
    let mut guard = CACHE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f(guard.get_or_insert_with(FxHashMap::default))
}

pub fn remember(file: &str, text: &str, options: &LinkOptions, styles: FileStyles) {
    let entry = Cached {
        source: fingerprint(text),
        options: options_fingerprint(options),
        styles,
    };
    with_cache(|cache| cache.insert(file.to_string(), entry));
}

pub fn compile(request: &serde_json::Value) -> Result<String, String> {
    let options = LinkOptions {
        root: request["root"].as_str().unwrap_or_default().to_string(),
        policy: crate::policy::property_policy_of(request)?,
    };
    let options_key = options_fingerprint(&options);
    let files = request["files"].as_array().map(Vec::as_slice).unwrap_or_default();
    with_cache(|cache| {
        let mut paths = FxHashSet::default();
        let mut styles = Vec::with_capacity(files.len());
        for file in files {
            let Some(path) = file["path"].as_str() else {
                continue;
            };
            paths.insert(path);
            let cached = cache.get(path).filter(|cached| cached.options == options_key);
            match (file["source"].as_str(), cached) {
                (Some(source), Some(cached)) if cached.source == fingerprint(source) => {}
                (Some(source), _) => {
                    let entry = Cached {
                        source: fingerprint(source),
                        options: options_key,
                        styles: extract_source(source, path, &options)?,
                    };
                    cache.insert(path.to_string(), entry);
                }
                (None, Some(_)) => {}
                (None, None) => return Err(format!("[typedcss] {path} was not sent with its source")),
            }
            styles.push(cache[path].styles.clone());
        }
        cache.retain(|path, _| paths.contains(path.as_str()));
        with_source_packages(&mut styles, &options)?;
        link(&styles)
    })
}

fn with_source_packages(styles: &mut Vec<FileStyles>, options: &LinkOptions) -> Result<(), String> {
    let root = std::path::Path::new(&options.root);
    let mut known: FxHashSet<String> = styles.iter().map(|file| file.path.clone()).collect();
    let mut index = 0;
    while index < styles.len() {
        let pending: Vec<String> = styles[index]
            .imports
            .iter()
            .filter(|path| path.starts_with("node_modules/") && !known.contains(*path))
            .cloned()
            .collect();
        for path in pending {
            known.insert(path.clone());
            let Some(file) = crate::fs::resolver::resolve_with_extension(&root.join(&path)) else {
                continue;
            };
            let source = crate::fs::source::read(&file).map_err(|error| format!("[typedcss] {file}: {error}"))?;
            styles.push(extract_source(&source, &file, options)?);
        }
        index += 1;
    }
    Ok(())
}
