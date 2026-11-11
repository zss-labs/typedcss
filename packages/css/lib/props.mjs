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
  let inline = null;
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (style == null || style === false) continue;
    if (Array.isArray(style)) return cachedMerge(flatten(styles));
    if (style.$$css == null) {
      for (const prop in style) {
        const value = style[prop];
        if (value != null) (inline ??= {})[prop] = value;
      }
      continue;
    }
    const children = (node.next ??= new WeakMap());
    let next = children.get(style);
    if (!next) {
      next = { next: undefined, value: undefined };
      children.set(style, next);
    }
    node = next;
  }
  if (node.value === undefined) node.value = [merge(styles), null];
  return inline === null ? node.value : [node.value[0], inline];
}

function seat(tree, key, winner) {
  const first = key.charCodeAt(0);
  let end = -1;
  if (first === 64) {
    for (let i = 1, depth = 0; i < key.length && end < 0; i++) {
      const code = key.charCodeAt(i);
      if (code === 40) depth++;
      else if (code === 41) depth--;
      else if (code === 58 && depth === 0) end = i;
    }
  } else if (first === 58 || first === 91) end = key.lastIndexOf(':');
  if (end < 0) return tree.set(key, winner);
  const scope = key.slice(0, end);
  let inner = tree.get(scope);
  if (!inner) tree.set(scope, (inner = new Map()));
  if (first === 64) seat(inner, key.slice(end + 1), winner);
  else inner.set(key.slice(end + 1), winner);
}

function collect(keys) {
  const tree = new Map();
  for (let slot = 0; slot < keys.length; slot++) seat(tree, keys[slot], slot);
  const slots = [];
  let selectors = false;
  let nested = false;
  for (const [key, entry] of tree) {
    if (!(entry instanceof Map)) slots.push(entry);
    else if (key.charCodeAt(0) !== 64) selectors = true;
    else {
      for (const inner of entry.values()) {
        if (inner instanceof Map) nested = true;
        else slots.push(inner);
      }
    }
  }
  if (selectors) {
    for (const [key, entry] of tree) {
      if (!(entry instanceof Map) || key.charCodeAt(0) === 64) continue;
      for (const inner of entry.values()) slots.push(inner);
    }
  }
  if (nested) {
    for (const [key, entry] of tree) {
      if (!(entry instanceof Map) || key.charCodeAt(0) !== 64) continue;
      for (const scope of entry.values()) {
        if (!(scope instanceof Map)) continue;
        for (const inner of scope.values()) slots.push(inner);
      }
    }
  }
  return slots;
}

function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function conflicts(a, b) {
  return (
    a.property === b.property ||
    a.covers.includes(b.property) ||
    b.covers.includes(a.property)
  );
}

function repair(atoms) {
  // A weight depends only on strictly lower base specificity, so resolve those first.
  atoms.sort((a, b) => compare(a.base, b.base));
  for (let i = 1; i < atoms.length; i++) {
    const a = atoms[i];
    for (let j = 0; j < i; j++) {
      const b = atoms[j];
      if (
        a.target !== b.target ||
        compare(a.base, b.base) === 0 ||
        !conflicts(a, b)
      )
        continue;
      const outranks =
        a.base[1] > b.base[1] ||
        (a.base[1] === b.base[1] && a.base[2] > b.base[2]);
      a.weight = Math.max(
        a.weight,
        b.base[0] + b.weight - a.base[0] + (outranks ? 0 : 1),
      );
    }
  }
}

function merge(styles) {
  const keys = [];
  const classes = [];
  let owners;
  let scoped = false;
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    if (style == null || style === false || style.$$css == null) continue;
    if (style.$$w) owners ??= [];
    for (const prop in style) {
      if (prop === '$$css' || prop === '$$w') continue;
      let slot = keys.indexOf(prop);
      if (slot < 0) {
        slot = keys.push(prop) - 1;
        const first = prop.charCodeAt(0);
        if (first === 58 || first === 64 || first === 91) scoped = true;
      }
      const value = style[prop];
      classes[slot] = typeof value === 'string' ? value : null;
      if (owners) owners[slot] = i;
    }
  }
  if (owners) escalate(styles, keys, classes, owners);
  const slots = scoped ? collect(keys) : null;
  let className = '';
  for (let i = 0; i < keys.length; i++) {
    const name = classes[slots ? slots[i] : i];
    if (name != null) className = className ? className + ' ' + name : name;
  }
  return className;
}

function escalate(styles, keys, classes, owners) {
  const atoms = [];
  for (let slot = 0; slot < keys.length; slot++) {
    const order = owners[slot];
    if (order === undefined || classes[slot] == null) continue;
    const states = styles[order].$$w;
    const state = states && states[keys[slot]];
    if (!state) continue;
    const parts = state[0].split('|');
    atoms.push({
      slot,
      order,
      group: state[0],
      target: parts[0] + '|' + parts[1],
      property: parts[parts.length - 1],
      base: state[1],
      covers: state[2] || [],
      weight: 0,
    });
  }
  atoms.sort((a, b) => b.order - a.order);
  const groups = new Map();
  let weighted = false;
  for (const atom of atoms) {
    let entry = groups.get(atom.group);
    if (!entry) {
      entry = { order: atom.order, weight: 0 };
      groups.set(atom.group, entry);
    } else if (entry.order !== atom.order) {
      entry.order = atom.order;
      entry.weight++;
      weighted = true;
    }
    atom.weight = entry.weight;
  }
  if (!weighted) return;
  for (const atom of atoms)
    atom.weight = groups.get(atom.group).weight - atom.weight;
  repair(atoms);
  for (const atom of atoms) {
    if (atom.weight > 0) classes[atom.slot] += `-w${atom.weight}`;
  }
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
