// Local conditions in a style array fold into Plumeria's lookup shape:
// independent keys become ternaries and conflicting keys share a table keyed by
// "0__1". For every combination of the conditions, the folded className has to
// hold the same classes as the static array written for that combination, the
// path that was already compiled before folding existed. Fallbacks included.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { renderClass } from './implementations';
import { implementations } from './implementations';

type Item = string | [test: string, on: string, off: string];

const STYLES = `import * as css from '@typedcss/css';
const s = css.create({
  base: { color: 'black', padding: 4, fontSize: 12 },
  red: { color: 'red' },
  blue: { color: 'blue', margin: 2 },
  pad: { padding: 8 },
  padTop: { paddingTop: 1 },
  margin: { margin: 6 },
  hover: { color: { default: 'gray', ':hover': 'green' } },
  wide: { width: { default: 10, '@media (min-width: 600px)': 20 } },
  narrow: { width: 5 },
});
`;

const CASES: Array<[string, Item[]]> = [
  [
    'conflicting conditions',
    ['s.base', ['x', 's.red', 'null'], ['y', 's.blue', 'null']],
  ],
  [
    'independent and conflicting together',
    [
      's.base',
      ['x', 's.red', 'null'],
      ['y', 's.pad', 's.margin'],
      ['z', 's.blue', 'null'],
    ],
  ],
  [
    'a fixed entry after the conditions overrides them',
    [['x', 's.red', 's.blue'], 's.base', ['y', 's.margin', 'null']],
  ],
  [
    'a shorthand and its longhand stay distinct',
    ['s.base', ['x', 's.padTop', 'null'], ['y', 's.pad', 'null']],
  ],
  // Pseudo and at-rule keys carry state weights, which depend on the whole set,
  // so these keep the runtime merge and still have to agree with the static array.
  [
    'a pseudo-class style',
    [
      ['x', 's.hover', 's.red'],
      ['y', 's.red', 'null'],
    ],
  ],
  [
    'an at-rule style',
    [
      ['x', 's.red', 's.blue'],
      ['y', 's.wide', 's.narrow'],
      ['z', 's.narrow', 'null'],
    ],
  ],
  [
    'the fallback when no table entry applies',
    ['s.red', ['x', 's.base', 'null'], ['y', 's.margin', 'null']],
  ],
];

const entry = (item: Item, bits: boolean[], index: number) =>
  typeof item === 'string' ? item : bits[index] ? item[1] : item[2];

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  let file = 0;
  const compile = async (sx: string, params: string[]) => {
    const filePath = path.join(DIR, `Fold${file++}.tsx`);
    const source = `${STYLES}export const A = ({ ${params.join(', ')} }: any) => <div sx={${sx}} />;`;
    fs.writeFileSync(filePath, source);
    const { code } = await transformSource({
      source,
      filePath,
      root: DIR,
      cwd: DIR,
      isDev: false,
    } as any);
    return code;
  };
  const classes = (code: string, props: Record<string, unknown> = {}) =>
    renderClass(code, props).split(/\s+/).filter(Boolean).sort();

  it.each(CASES)('%s', async (_, items) => {
    const tests = items
      .filter(
        (item): item is [string, string, string] => typeof item !== 'string',
      )
      .map(([test]) => test);
    const folded = await compile(
      `[${items.map((item) => (typeof item === 'string' ? item : `${item[0]} ? ${item[1]} : ${item[2]}`)).join(', ')}]`,
      tests,
    );
    const stateful = items
      .flat()
      .some((name) => name === 's.hover' || name === 's.wide');
    expect(folded.includes('__typedcss_props')).toBe(stateful);
    for (let mask = 0; mask < 1 << tests.length; mask++) {
      const bits = tests.map((_, bit) => Boolean((mask >> bit) & 1));
      let choice = 0;
      const chosen = items.map((item) =>
        entry(item, bits, typeof item === 'string' ? -1 : choice++),
      );
      const expected = await compile(`[${chosen.join(', ')}]`, []);
      expect(expected).not.toContain('__typedcss_props');
      const props = Object.fromEntries(
        tests.map((test, bit) => [test, bits[bit]]),
      );
      expect({ props, classes: classes(folded, props) }).toEqual({
        props,
        classes: classes(expected),
      });
    }
  });
});
