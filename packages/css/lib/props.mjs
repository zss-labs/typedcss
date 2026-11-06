function compare(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function conflicts(a, b) {
  return a.property === b.property || a.covers.includes(b.property) || b.covers.includes(a.property);
}

function repair(atoms) {
  for (let round = 0; round < atoms.length; round++) {
    let repaired = false;
    for (const a of atoms) {
      for (const b of atoms) {
        if (a === b || a.target !== b.target || !conflicts(a, b)) continue;
        if (compare(a.base, b.base) <= 0) continue;
        const post = [a.base[0] + a.weight, a.base[1], a.base[2]];
        const rival = [b.base[0] + b.weight, b.base[1], b.base[2]];
        if (compare(post, rival) > 0) continue;
        const outranks = compare([0, post[1], post[2]], [0, rival[1], rival[2]]) > 0;
        a.weight += rival[0] - post[0] + (outranks ? 0 : 1);
        repaired = true;
      }
    }
    if (!repaired) break;
  }
}

function merge(styles) {
  const defined = new Set();
  const winners = [];
  let inline = null;
  const stack = styles.slice();
  let order = 0;
  while (stack.length > 0) {
    const style = stack.pop();
    if (style == null || style === false) continue;
    if (Array.isArray(style)) {
      for (let i = 0; i < style.length; i++) stack.push(style[i]);
      continue;
    }
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
  const groups = new Map();
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
    let orders = groups.get(group);
    if (!orders) groups.set(group, (orders = []));
    if (!orders.includes(winner.order)) orders.push(winner.order);
  }
  for (const atom of atoms) {
    const orders = groups.get(atom.group);
    atom.weight = orders.length > 1 ? orders.filter((other) => other > atom.winner.order).length : 0;
  }
  if (atoms.some((atom) => atom.weight > 0)) repair(atoms);
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
  const [className, style] = merge(styles);
  const result = {};
  if (className) result.className = className;
  if (style) result.style = style;
  return result;
}

export function classProps(...styles) {
  const [className, style] = merge(styles);
  const result = {};
  if (className) result.class = className;
  if (style) result.style = style;
  return result;
}
