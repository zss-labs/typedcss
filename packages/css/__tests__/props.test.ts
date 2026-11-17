import * as css from '@typedcss/css';

// Tests pass compiled runtime maps ($$css, $$w), which the public Style type does not model.
const props = (...styles: unknown[]) => css.props(...(styles as css.Style[]));
const { classProps } = css as typeof css & {
  classProps(...styles: unknown[]): {
    class?: string;
    style?: Record<string, string | number>;
  };
};

it('keeps cached sequences, prefixes and output objects independent', () => {
  const a = { $$css: true, color: 'red' };
  const b = { $$css: true, color: 'blue' };
  for (let i = 0; i < 2; i++) {
    expect(props(a, b)).toEqual({ className: 'blue' });
    expect(props(b, a)).toEqual({ className: 'red' });
    expect(props(a)).toEqual({ className: 'red' });
    expect(props(null, a, false, b)).toEqual({ className: 'blue' });
  }
  props(a, b).className = 'changed';
  expect(props(a, b)).toEqual({ className: 'blue' });
});

it('observes mutable inline styles and nested arrays after cache hits', () => {
  const a = { $$css: true, color: 'red' };
  const b = { $$css: true, color: 'blue' };
  props(a);
  const inline = { '--x': 'green' };
  expect(props(a, inline)).toEqual({
    className: 'red',
    style: { '--x': 'green' },
  });
  inline['--x'] = 'purple';
  expect(props(a, inline)).toEqual({
    className: 'red',
    style: { '--x': 'purple' },
  });
  const nested = [a];
  expect(props(nested)).toEqual({ className: 'red' });
  nested.push(b);
  expect(props(nested)).toEqual({ className: 'blue' });
});

it('reuses resolved weights without modifying compiled styles', () => {
  const a = { $$css: true, a: 'red', $$w: { a: ['t|s|color', [0, 1, 0], []] } };
  const b = {
    $$css: true,
    b: 'blue',
    $$w: { b: ['t|s|color', [0, 1, 0], []] },
  };
  const original = JSON.stringify([a, b]);
  for (let i = 0; i < 2; i++) {
    expect(props(a, b)).toEqual({ className: 'red blue-w1' });
    expect(props(b, a)).toEqual({ className: 'blue red-w1' });
  }
  expect(JSON.stringify([a, b])).toBe(original);
});

it('preserves plain compiled property order and null suppression', () => {
  const a = { $$css: true, color: 'red', backgroundColor: 'bg' };
  const b = { $$css: true, color: null };
  expect(props(a)).toEqual({ className: 'red bg' });
  expect(props(a, b)).toEqual({ className: 'bg' });
  expect(props(a, b)).toEqual({ className: 'bg' });
});

it('resolves large compiled maps across the property lookup threshold', () => {
  const a = {
    $$css: true,
    ...Object.fromEntries(
      Array.from({ length: 64 }, (_, i) => ['p' + i, 'c' + i]),
    ),
  };
  const b = { $$css: true, p0: 'override', p32: null };
  const expected = Array.from({ length: 64 }, (_, i) => i)
    .filter((i) => i !== 32)
    .map((i) => (i === 0 ? 'override' : 'c' + i))
    .join(' ');
  expect(props(a, b)).toEqual({ className: expected });
  expect(props(a, b)).toEqual({ className: expected });
});

it('propagates repairs from lower specificity without changing class order', () => {
  const make = (key: string, specificity: number) => ({
    $$css: true,
    [key]: key,
    $$w: { [key]: ['t|s|color', [0, specificity, 0], []] },
  });
  const high = make('high', 3);
  const mid = make('mid', 2);
  const low = make('low', 1);
  expect(props(high, mid, low)).toEqual({ className: 'high-w2 mid-w2 low-w2' });
  expect(props(low, mid, high)).toEqual({ className: 'low mid-w1 high-w2' });
  expect(props(high, mid, low)).toEqual({ className: 'high-w2 mid-w2 low-w2' });
});

it('shares sequence caching across nested arrays while observing their changes', () => {
  const a = { $$css: true, color: 'red' };
  const b = { $$css: true, color: 'blue' };
  const inner = [b];
  const outer = [a, inner];
  expect(props(a, b)).toEqual({ className: 'blue' });
  expect(props(outer)).toEqual({ className: 'blue' });
  inner[0] = a;
  expect(props(outer)).toEqual({ className: 'red' });
  inner.length = 0;
  expect(props(outer)).toEqual({ className: 'red' });
  expect(props([a, [{ '--x': 'green' }]])).toEqual({
    className: 'red',
    style: { '--x': 'green' },
  });
});

it('orders selectors and nested at-rules by their final declarations', () => {
  const style = {
    $$css: true,
    color: 'base',
    ':hover:color': 'hover-color',
    ':hover:background': 'hover-background',
    '[open]:color': 'open-color',
    '@media (width: 1px):color': 'media-color',
    '@media (width: 1px)::hover:color': 'media-hover-color',
    '@supports (selector(:is(a, b)))::focus:color': 'supports-focus-color',
  };
  const override = {
    $$css: true,
    ':hover:color': 'hover-override',
    '@media (width: 1px)::hover:color': 'media-hover-override',
  };

  expect(props(style, override)).toEqual({
    className:
      'base media-color hover-override hover-background open-color media-hover-override supports-focus-color',
  });
});

it('repairs conflicting weighted atoms and ignores incomplete weight metadata', () => {
  const compiled = (
    key: string,
    group: string,
    property: string,
    base: number[],
    covers?: string[],
  ) => ({
    $$css: true,
    [key]: key,
    $$w: { [key]: [`target|scope|${group}|${property}`, base, covers] },
  });
  const shorthand = compiled(
    'shorthand',
    'shared',
    'margin',
    [1, 1, 0],
    ['marginLeft'],
  );
  const earlierShorthand = compiled(
    'earlierShorthand',
    'shared',
    'margin',
    [1, 1, 0],
    ['marginLeft'],
  );
  const longhand = compiled('longhand', 'shared', 'marginLeft', [0, 1, 0]);
  const higher = compiled('higher', 'higher', 'marginLeft', [0, 1, 1]);
  const unrelated = compiled('unrelated', 'other', 'color', [0, 1, 0]);
  const noState = { $$css: true, missing: 'missing', $$w: {} };
  const falseState = { $$css: true, empty: 'empty', $$w: { empty: null } };
  const nullClass = {
    $$css: true,
    hidden: null,
    $$w: { hidden: ['target|scope|shared|margin', [0, 0, 0]] },
  };

  expect(
    props(
      higher,
      unrelated,
      noState,
      falseState,
      nullClass,
      earlierShorthand,
      shorthand,
      longhand,
    ),
  ).toEqual({
    className:
      'higher unrelated missing empty earlierShorthand shorthand-w1 longhand',
  });
});

it('returns class props and omits empty or null inline values', () => {
  const compiled = { $$css: true, color: 'red' };

  expect(classProps(compiled, { color: null, opacity: 0 })).toEqual({
    class: 'red',
    style: { opacity: 0 },
  });
  expect(classProps(null, false, {}, { color: null })).toEqual({});
  expect(props()).toEqual({});
});

it('handles un-nested at-rules and weight groups owned by one style', () => {
  expect(
    props({
      $$css: true,
      '@media (width: 1px):color': 'media',
    }),
  ).toEqual({ className: 'media' });

  expect(
    props({
      $$css: true,
      first: 'first',
      second: 'second',
      $$w: {
        first: ['target|scope|color', [0, 1, 0]],
        second: ['target|scope|color', [0, 1, 0]],
      },
    }),
  ).toEqual({ className: 'first second' });
});
