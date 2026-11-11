use indexmap::IndexMap;
use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use rustc_hash::{FxBuildHasher, FxHashMap, FxHashSet};

use crate::js::{Object, Value};
use crate::oxc::model::{Entry, Model};
use crate::oxc::syntax::module::{CORE, SpecKind, import_specs};
use crate::style::escalation::{StateAtom, state_atoms};
use crate::style::records::{StyleRecord, atom_map_of};

struct StaticStyle {
    map: Object,
    states: Vec<StateAtom>,
}

struct Definition {
    end: u32,
    entries: FxHashMap<String, StaticStyle>,
}

#[derive(Default)]
struct Bindings(FxHashMap<String, usize>);

impl<'a> Visit<'a> for Bindings {
    fn visit_binding_identifier(&mut self, binding: &BindingIdentifier<'a>) {
        *self.0.entry(binding.name.to_string()).or_default() += 1;
    }
}

#[derive(Default)]
pub(super) struct StaticStyles {
    definitions: FxHashMap<String, Definition>,
    namespaces: FxHashSet<String>,
    props: FxHashMap<String, &'static str>,
}

fn class_prop_of(export: &str) -> Option<&'static str> {
    match export {
        "props" => Some("className"),
        "classProps" => Some("class"),
        _ => None,
    }
}

impl StaticStyles {
    pub fn new(program: &Program, model: &Model, records: &[Vec<Vec<StyleRecord>>]) -> Self {
        let mut bindings = Bindings::default();
        bindings.visit_program(program);
        let mut definitions = FxHashMap::default();
        let mut namespaces = FxHashSet::default();
        let mut props = FxHashMap::default();
        for statement in &program.body {
            if let Statement::ImportDeclaration(import) = statement
                && !import.import_kind.is_type()
                && import.source.value == CORE
            {
                for spec in import_specs(import) {
                    if spec.type_only || bindings.0.get(spec.local) != Some(&1) {
                        continue;
                    }
                    match spec.kind {
                        SpecKind::Named => {
                            if let Some(class_prop) = class_prop_of(&spec.imported) {
                                props.insert(spec.local.to_string(), class_prop);
                            }
                        }
                        SpecKind::Default | SpecKind::Namespace => {
                            namespaces.insert(spec.local.to_string());
                        }
                    }
                }
            }
            let declaration = match statement {
                Statement::VariableDeclaration(decl) => &**decl,
                Statement::ExportDeclaration(export) => match &export.declaration {
                    Declaration::VariableDeclaration(decl) => &**decl,
                    _ => continue,
                },
                _ => continue,
            };
            if declaration.kind != VariableDeclarationKind::Const {
                continue;
            }
            for declaration in &declaration.declarations {
                let BindingPattern::BindingIdentifier(binding) = &declaration.id else {
                    continue;
                };
                let name = binding.name.as_str();
                if bindings.0.get(name) != Some(&1) {
                    continue;
                }
                let Some((index, _, styles)) = model.creates.get_full(name) else {
                    continue;
                };
                let entries = styles
                    .entries
                    .iter()
                    .zip(&records[index])
                    .filter_map(|((name, entry), records)| {
                        let Entry::Static(style) = entry else {
                            return None;
                        };
                        Some((
                            name.clone(),
                            StaticStyle {
                                map: atom_map_of(records),
                                states: state_atoms(style),
                            },
                        ))
                    })
                    .collect();
                definitions.insert(
                    name.to_string(),
                    Definition {
                        end: declaration.span.end,
                        entries,
                    },
                );
            }
        }
        Self { definitions, namespaces, props }
    }

    pub fn remove_unused(&self, program: &mut Program) {
        #[derive(Default)]
        struct Reads(FxHashSet<String>);
        impl<'a> Visit<'a> for Reads {
            fn visit_identifier_reference(&mut self, ident: &IdentifierReference<'a>) {
                self.0.insert(ident.name.to_string());
            }
        }
        let mut reads = Reads::default();
        reads.visit_program(program);
        if reads.0.contains("eval") {
            return;
        }
        program.body.retain_mut(|statement| {
            let Statement::VariableDeclaration(decl) = statement else { return true };
            decl.declarations.retain(|declaration| {
                let BindingPattern::BindingIdentifier(binding) = &declaration.id else { return true };
                !self.definitions.get(binding.name.as_str()).is_some_and(|definition| !definition.entries.is_empty()) || reads.0.contains(binding.name.as_str())
            });
            !decl.declarations.is_empty()
        });
    }

    fn resolve<'s>(
        &'s self,
        expression: &Expression,
        deferred: bool,
        styles: &mut Vec<&'s StaticStyle>,
    ) -> Option<()> {
        match expression {
            Expression::ParenthesizedExpression(paren) => self.resolve(&paren.expression, deferred, styles),
            Expression::ArrayExpression(array) => {
                for element in &array.elements {
                    match element {
                        ArrayExpressionElement::Elision(_) => {}
                        ArrayExpressionElement::SpreadElement(_) => return None,
                        expression => self.resolve(expression.as_expression()?, deferred, styles)?,
                    }
                }
                Some(())
            }
            Expression::NullLiteral(_) => Some(()),
            Expression::BooleanLiteral(value) if !value.value => Some(()),
            Expression::StaticMemberExpression(member) if !member.optional => {
                let Expression::Identifier(object) = &member.object else {
                    return None;
                };
                let definition = self.definitions.get(object.name.as_str())?;
                if !deferred && object.span.start < definition.end {
                    return None;
                }
                styles.push(definition.entries.get(member.property.name.as_str())?);
                Some(())
            }
            _ => None,
        }
    }

    pub fn class_name(&self, value: &JSXAttributeValue, deferred: bool) -> Option<String> {
        let JSXAttributeValue::ExpressionContainer(container) = value else {
            return None;
        };
        let mut styles = Vec::new();
        self.resolve(container.expression.as_expression()?, deferred, &mut styles)?;
        Some(merge(&styles))
    }

    pub fn props_callee(&self, callee: &Expression) -> Option<&'static str> {
        match callee {
            Expression::Identifier(ident) => self.props.get(ident.name.as_str()).copied(),
            Expression::StaticMemberExpression(member) if !member.optional => {
                let Expression::Identifier(object) = &member.object else {
                    return None;
                };
                if !self.namespaces.contains(object.name.as_str()) {
                    return None;
                }
                class_prop_of(member.property.name.as_str())
            }
            _ => None,
        }
    }

    pub fn spread_class_name(&self, argument: &Expression, deferred: bool) -> Option<(String, &'static str)> {
        let Expression::CallExpression(call) = argument else {
            return None;
        };
        if call.optional {
            return None;
        }
        let class_prop = self.props_callee(&call.callee)?;
        let mut styles = Vec::new();
        for argument in &call.arguments {
            self.resolve(argument.as_expression()?, deferred, &mut styles)?;
        }
        Some((merge(&styles), class_prop))
    }
}

struct Winner<'a> {
    class: &'a str,
    state: Option<&'a StateAtom>,
    order: usize,
    weight: i64,
}

enum Node<'a> {
    Class(Option<usize>),
    Scope(Tree<'a>),
}

type Tree<'a> = IndexMap<&'a str, Node<'a>, FxBuildHasher>;

fn seat<'a>(tree: &mut Tree<'a>, key: &'a str, winner: Option<usize>) {
    let at_rule = key.starts_with('@');
    let end = if at_rule {
        let mut depth = 0;
        key.bytes().position(|byte| {
            match byte {
                b'(' => depth += 1,
                b')' => depth -= 1,
                _ => {}
            }
            byte == b':' && depth == 0
        })
    } else if key.starts_with([':', '[']) {
        key.rfind(':')
    } else {
        None
    };
    let Some(end) = end else {
        tree.insert(key, Node::Class(winner));
        return;
    };
    let scope = tree.entry(&key[..end]).or_insert_with(|| Node::Scope(Tree::default()));
    let Node::Scope(inner) = scope else { return };
    if at_rule {
        seat(inner, &key[end + 1..], winner);
    } else {
        inner.insert(&key[end + 1..], Node::Class(winner));
    }
}

fn collect(tree: &Tree) -> Vec<usize> {
    let mut winners = Vec::new();
    for (key, node) in tree {
        match node {
            Node::Class(winner) => winners.extend(winner),
            Node::Scope(inner) if key.starts_with('@') => {
                winners.extend(inner.values().filter_map(|node| match node {
                    Node::Class(winner) => *winner,
                    Node::Scope(_) => None,
                }));
            }
            Node::Scope(_) => {}
        }
    }
    let classes = |scope: &Tree| -> Vec<usize> {
        scope.values().filter_map(|node| match node {
            Node::Class(winner) => *winner,
            Node::Scope(_) => None,
        }).collect()
    };
    for (key, node) in tree {
        if let Node::Scope(inner) = node
            && !key.starts_with('@')
        {
            winners.extend(classes(inner));
        }
    }
    for (key, node) in tree {
        if let Node::Scope(inner) = node
            && key.starts_with('@')
        {
            for scope in inner.values() {
                if let Node::Scope(scope) = scope {
                    winners.extend(classes(scope));
                }
            }
        }
    }
    winners
}

fn merge(styles: &[&StaticStyle]) -> String {
    let mut tree = Tree::default();
    let mut winners = Vec::new();
    for (order, style) in styles.iter().enumerate() {
        for (key, value) in style.map.iter() {
            let winner = match value {
                Value::Str(class) => {
                    winners.push(Winner {
                        class,
                        state: style.states.iter().find(|state| state.key == key),
                        order,
                        weight: 0,
                    });
                    Some(winners.len() - 1)
                }
                _ => None,
            };
            seat(&mut tree, key, winner);
        }
    }
    let ordered = collect(&tree);
    let mut atoms: Vec<usize> = ordered.iter().copied().filter(|&index| winners[index].state.is_some()).collect();
    atoms.sort_by_key(|&index| std::cmp::Reverse(winners[index].order));
    let mut groups: FxHashMap<&str, (usize, i64)> = FxHashMap::default();
    let mut weighted = false;
    for &index in &atoms {
        let winner = &mut winners[index];
        let group = groups.entry(&winner.state.unwrap().group).or_insert((winner.order, 0));
        if group.0 != winner.order {
            group.0 = winner.order;
            group.1 += 1;
            weighted = true;
        }
        winner.weight = group.1;
    }
    if weighted {
        for &index in &atoms {
            let winner = &mut winners[index];
            winner.weight = groups[winner.state.unwrap().group.as_str()].1 - winner.weight;
        }
        atoms.sort_by_key(|&index| winners[index].state.unwrap().base);
        for (position, &index) in atoms.iter().enumerate() {
            let a = winners[index].state.unwrap();
            for &other in &atoms[..position] {
                let b = winners[other].state.unwrap();
                if a.target != b.target
                    || a.base == b.base
                    || !(a.property == b.property
                        || a.covers.contains(&b.property)
                        || b.covers.contains(&a.property))
                {
                    continue;
                }
                let outranks =
                    a.base[1] > b.base[1] || (a.base[1] == b.base[1] && a.base[2] > b.base[2]);
                winners[index].weight = winners[index]
                    .weight
                    .max(b.base[0] + winners[other].weight - a.base[0] + i64::from(!outranks));
            }
        }
    }
    ordered
        .iter()
        .map(|&index| {
            let winner = &winners[index];
            if winner.weight > 0 {
                format!("{}-w{}", winner.class, winner.weight)
            } else {
                winner.class.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
