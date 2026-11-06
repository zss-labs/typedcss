use std::collections::VecDeque;

use rustc_hash::{FxHashMap, FxHashSet};

use crate::engine::shorthand::{direct_longhands, get_property_depth};
use crate::engine::specificity::{get_pseudo_element, get_specificity};
use crate::engine::{NOT_NORMALIZE, camel_to_kebab_case, is_at_rule};
use crate::js::{Object, Value};
use crate::style::records::style_records;

#[derive(Clone, Debug)]
pub struct StateAtom {
    pub key: String,
    pub group: String,
    pub target: String,
    pub property: String,
    pub base: [i64; 3],
    pub covers: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct WeightedSheet {
    pub atom: StateAtom,
    pub hash: String,
    pub sheet: String,
}

fn longhands_of(shorthand: &str) -> Vec<String> {
    let mut seen: FxHashSet<&str> = FxHashSet::default();
    let mut queue: VecDeque<&str> = direct_longhands(shorthand).iter().copied().collect();
    let mut found = Vec::new();
    while let Some(current) = queue.pop_front() {
        if !seen.insert(current) {
            continue;
        }
        found.push(current.to_string());
        queue.extend(direct_longhands(current).iter().copied());
    }
    found
}

fn collect(selector: &str, style: &Object, at_rule: &str, atoms: &mut Vec<StateAtom>) {
    let specificity = get_specificity(selector);
    let pseudo_element = get_pseudo_element(selector);
    for (prop, value) in style.iter() {
        if !value.is_primitive_text() {
            continue;
        }
        let property = camel_to_kebab_case(prop);
        let target = format!("{at_rule}|{pseudo_element}");
        let condition_depth: i64 = if prop.starts_with("--") { 0 } else { 1 + i64::from(!at_rule.is_empty()) };
        atoms.push(StateAtom {
            key: if at_rule.is_empty() {
                format!("{selector}:{prop}")
            } else {
                format!("{at_rule}:{selector}:{prop}")
            },
            group: format!("{target}|{},{},{}|{property}", specificity[0], specificity[1], specificity[2]),
            target,
            base: [
                condition_depth + get_property_depth(&property) as i64 + specificity[0],
                1 + specificity[1],
                specificity[2],
            ],
            covers: longhands_of(&property),
            property,
        });
    }
}

pub fn state_atoms(style: &Object) -> Vec<StateAtom> {
    let mut atoms = Vec::new();
    for (key, value) in style.iter() {
        let Value::Obj(nested) = value else { continue };
        if is_at_rule(key) {
            for (inner, inner_value) in nested.iter() {
                if let Value::Obj(inner_style) = inner_value {
                    collect(inner, inner_style, key, &mut atoms);
                }
            }
            continue;
        }
        collect(key, nested, "", &mut atoms);
    }
    atoms
}

pub fn weighted_sheets(style: &Object) -> Vec<WeightedSheet> {
    let atoms = state_atoms(style);
    style_records(style, None)
        .into_iter()
        .filter_map(|record| {
            let atom = atoms.iter().find(|atom| atom.key == record.key)?;
            Some(WeightedSheet {
                atom: atom.clone(),
                hash: record.hash,
                sheet: record.sheet,
            })
        })
        .collect()
}

fn conflicts(a: &StateAtom, b: &StateAtom) -> bool {
    a.property == b.property || a.covers.contains(&b.property) || b.covers.contains(&a.property)
}

pub fn weighted_variants<'a>(sheets: impl Iterator<Item = &'a WeightedSheet> + Clone) -> Vec<String> {
    let mut seats: FxHashMap<&str, FxHashSet<&str>> = FxHashMap::default();
    for sheet in sheets.clone() {
        seats.entry(&sheet.atom.group).or_default().insert(&sheet.atom.key);
    }
    let mut ranks: FxHashMap<&str, (&StateAtom, usize)> = FxHashMap::default();
    for sheet in sheets.clone() {
        let rank = seats[sheet.atom.group.as_str()].len() - 1;
        ranks.entry(&sheet.atom.group).or_insert((&sheet.atom, rank));
    }
    let mut variants = Vec::new();
    for sheet in sheets {
        let bound = ranks
            .values()
            .filter(|(other, _)| other.target == sheet.atom.target && conflicts(other, &sheet.atom))
            .map(|(_, rank)| *rank)
            .max()
            .unwrap_or(0);
        let class = format!(".{}", sheet.hash);
        for weight in 1..=bound {
            let name = format!("{class}-w{weight}{}", NOT_NORMALIZE.repeat(weight));
            variants.push(sheet.sheet.replacen(&class, &name, 1));
        }
    }
    variants
}
