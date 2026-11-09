// Compiled style maps (including $$w) are immutable. Cache by their sequence.
const cache = { next: new WeakMap(), value: undefined };

function flatten(styles, result = []) {
  for (const style of styles) {
    if (Array.isArray(style)) flatten(style, result);
    else result.push(style);
  }
  return result;
}

function cachedMerge(styles) {
  if (styles.length === 1) {
    const hit = cache.next.get(styles[0]);
    if (hit && hit.value !== undefined) return hit.value;
  }
  let node = cache;
  let weighted = false;
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (style == null || style === false) continue;
    if (Array.isArray(style) || style.$$css == null) return flatMerge(styles);
    if (style.$$w) weighted = true;
    const children = (node.next ??= new WeakMap());
    let next = children.get(style);
    if (!next) {
      next = { next: undefined, value: undefined };
      children.set(style, next);
    }
    node = next;
  }
  if (node.value === undefined) {
    node.value = weighted ? merge(styles) : mergeFlat(styles);
  }
  return node.value;
}

// Flatten current contents, never cache by a mutable array's identity. Dynamic styles return
// a fresh compiled map next to their inline variables, so calls with inline styles skip the cache.
function flatMerge(styles) {
  const flat = flatten(styles);
  for (let i = 0; i < flat.length; i++) {
    const style = flat[i];
    if (style != null && style !== false && style.$$css == null) return mergeFlat(flat) ?? merge(flat);
  }
  return cachedMerge(flat);
}

// Without weight metadata, resolve properties directly into the class string and inline style.
// Returns undefined when a style carries weights.
function mergeFlat(styles) {
  const defined = [];
  let definedSet;
  let className = '';
  let inline = null;
  for (let i = styles.length - 1; i >= 0; i--) {
    const style = styles[i];
    if (style == null || style === false) continue;
    if (style.$$w) return undefined;
    const compiled = style.$$css != null;
    let sub = null;
    for (const prop in style) {
      const value = style[prop];
      if (compiled ? prop === '$$css' : value === undefined) continue;
      if (definedSet ? definedSet.has(prop) : defined.includes(prop)) continue;
      if (definedSet) definedSet.add(prop);
      else {
        defined.push(prop);
        if (defined.length === 32) definedSet = new Set(defined);
      }
      if (!compiled) {
        if (value != null) (sub ??= {})[prop] = value;
      } else if (typeof value === 'string') className = className ? value + ' ' + className : value;
    }
    if (sub != null) inline = Object.assign(sub, inline);
  }
  return [className, inline];
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function conflicts(a, b) {
  return a.property === b.property || a.covers.includes(b.property) || b.covers.includes(a.property);
}

function repair(atoms) {
  // A weight depends only on strictly lower base specificity, so resolve those first.
  if (atoms.length === 2) {
    if (compare(atoms[0].base, atoms[1].base) > 0) [atoms[0], atoms[1]] = [atoms[1], atoms[0]];
  } else atoms.sort((a, b) => compare(a.base, b.base));
  for (let i = 1; i < atoms.length; i++) {
    const a = atoms[i];
    for (let j = 0; j < i; j++) {
      const b = atoms[j];
      if (a.target !== b.target || compare(a.base, b.base) === 0 || !conflicts(a, b)) continue;
      const outranks = a.base[1] > b.base[1] || (a.base[1] === b.base[1] && a.base[2] > b.base[2]);
      a.weight = Math.max(a.weight, b.base[0] + b.weight - a.base[0] + (outranks ? 0 : 1));
    }
  }
}

// Callers pass flattened styles.
function merge(styles) {
  const defined = new Set();
  const winners = [];
  let inline = null;
  let order = 0;
  for (let i = styles.length - 1; i >= 0; i--) {
    const style = styles[i];
    if (style == null || style === false) continue;
    order++;
    if (style.$$css != null) {
      const groups = style.$$w;
      for (const prop in style) {
        if (prop === '$$css' || prop === '$$w') continue;
        const value = style[prop];
        if (defined.has(prop)) continue;
        defined.add(prop);
        if (typeof value === 'string') {
          winners.push({ value, order, state: groups && groups[prop] });
        }
      }
    } else {
      let sub = null;
      for (const prop in style) {
        const value = style[prop];
        if (value === undefined || defined.has(prop)) continue;
        defined.add(prop);
        if (value != null) (sub ??= {})[prop] = value;
      }
      if (sub != null) inline = Object.assign(sub, inline);
    }
  }
  const atoms = [];
  let groups;
  let weighted = false;
  for (const winner of winners) {
    const state = winner.state;
    if (!state) continue;
    const [group, base, covers] = state;
    const parts = group.split('|');
    const atom = {
      winner,
      group,
      target: parts[0] + '|' + parts[1],
      property: parts[parts.length - 1],
      base,
      covers: covers || [],
    };
    atoms.push(atom);
    groups ??= new Map();
    let entry = groups.get(group);
    if (!entry) {
      entry = { order: winner.order, weight: 0 };
      groups.set(group, entry);
    } else if (entry.order !== winner.order) {
      entry.order = winner.order;
      entry.weight++;
      weighted = true;
    }
    atom.weight = entry.weight;
  }
  if (weighted) {
    for (const atom of atoms) atom.weight = groups.get(atom.group).weight - atom.weight;
    repair(atoms);
  }
  for (const atom of atoms) {
    if (atom.weight > 0) atom.winner.value = `${atom.winner.value}-w${atom.weight}`;
  }
  let className = '';
  for (let i = winners.length - 1; i >= 0; i--) {
    const name = winners[i].value;
    className = className ? `${className} ${name}` : name;
  }
  return [className, inline];
}

export function props(...styles) {
  const [className, style] = cachedMerge(styles);
  const result = {};
  if (className) result.className = className;
  if (style) result.style = style;
  return result;
}

export function classProps(...styles) {
  const [className, style] = cachedMerge(styles);
  const result = {};
  if (className) result.class = className;
  if (style) result.style = style;
  return result;
}
