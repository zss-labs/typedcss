import { renderClass } from './implementations';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  const env = (source: string, filePath: string) => ({
    source,
    moduleId: filePath,
    filePath,
    root: DIR,
    cwd: DIR,
    styleProp: DEFAULT_STYLE_PROP,
    propertyPolicy: undefined,
    isDev: false,
    addDependency: () => {},
  });

  const HEAD = `
import * as css from '@typedcss/css';
const a = css.create({ a0: { color: 'red' }, a1: { color: 'blue' } });
const b = css.create({ b0: { color: 'teal' }, b1: { color: 'navy' } });
const c = css.create({ c0: { margin: 1 }, c1: { margin: 2 } });
const d = css.create({ d0: { margin: 3 }, d1: { margin: 4 } });
const bridge = css.create({
  e0: { color: 'gold', margin: 5 },
  e1: { color: 'gray', margin: 6 },
});
`;

  const classExpr = async (styleExpr: string) => {
    const result = await transformSource(
      env(
        `${HEAD}export const A = ({ ka, kb, kc, kd, ke }: any) => <div sx={${styleExpr}} />;`,
        `${DIR}/fixture.tsx`,
      ),
    );
    const code = typeof result === 'string' ? result : (result?.code ?? '');
    // typedcss merges at runtime, so the module itself is what gets evaluated.
    return code;
  };

  const tableSizes = (expr: string) =>
    (expr.match(/\{(?:"[^"]*":"[^"]*",?)+\}/g) ?? [])
      .map((table) => (table.match(/":"/g) ?? []).length)
      .filter((size) => size > 2);

  const norm = (value: string) =>
    value.trim().split(/\s+/).filter(Boolean).sort().join(' ');

  const evaluate = (code: string, vars: Record<string, unknown>) =>
    norm(renderClass(code, vars));

  const literal = (styleExpr: string, combo: Record<string, string>) =>
    styleExpr
      .replace(/a\[ka\]/g, `a.${combo.ka}`)
      .replace(/b\[kb\]/g, `b.${combo.kb}`)
      .replace(/c\[kc\]/g, `c.${combo.kc}`)
      .replace(/d\[kd\]/g, `d.${combo.kd}`)
      .replace(/bridge\[ke\]/g, `bridge.${combo.ke}`);

  const SPACES: Record<string, string[]> = {
    ka: ['a0', 'a1'],
    kb: ['b0', 'b1'],
    kc: ['c0', 'c1'],
    kd: ['d0', 'd1'],
    ke: ['e0', 'e1'],
  };

  const combosOf = (names: string[]) =>
    names.reduce<Array<Record<string, string>>>(
      (acc, name) =>
        acc.flatMap((base) =>
          SPACES[name].map((value) => ({ ...base, [name]: value })),
        ),
      [{}],
    );

  describe('transform: the conflict product splits per connected component', () => {
    // Not a typedcss requirement: Plumeria compiles bracket groups into lookup tables at build time; typedcss picks the classes at runtime, so there are no tables to size.
    it.skip('keeps one table when every group fights over the same property', async () => {
      expect(tableSizes(await classExpr('[a[ka], b[kb]]'))).toEqual([4]);
    });

    // Not a typedcss requirement: Plumeria compiles bracket groups into lookup tables at build time; typedcss picks the classes at runtime, so there are no tables to size.
    it.skip('splits two unrelated pairs into two tables', async () => {
      expect(
        tableSizes(await classExpr('[a[ka], b[kb], c[kc], d[kd]]')),
      ).toEqual([4, 4]);
    });

    // Not a typedcss requirement: Plumeria compiles bracket groups into lookup tables at build time; typedcss picks the classes at runtime, so there are no tables to size.
    it.skip('rejoins the pairs when a group bridges both properties', async () => {
      expect(
        tableSizes(await classExpr('[a[ka], b[kb], c[kc], d[kd], bridge[ke]]')),
      ).toEqual([32]);
    });

    // Not a typedcss requirement: Plumeria compiles bracket groups into lookup tables at build time; typedcss picks the classes at runtime, so there are no tables to size.
    it.skip('leaves a lone boolean condition out of an unrelated product', async () => {
      expect(
        tableSizes(await classExpr('[a[ka], b[kb], kc && c.c0, d[kd]]')),
      ).toEqual([4, 4]);
    });

    it.each([
      [
        'unrelated pairs',
        '[a[ka], b[kb], c[kc], d[kd]]',
        ['ka', 'kb', 'kc', 'kd'],
      ],
      [
        'bridged pairs',
        '[a[ka], b[kb], c[kc], d[kd], bridge[ke]]',
        ['ka', 'kb', 'kc', 'kd', 'ke'],
      ],
      [
        'a bridge in the middle',
        '[a[ka], bridge[ke], d[kd]]',
        ['ka', 'ke', 'kd'],
      ],
      [
        'a base ahead of two pairs',
        '[a.a0, b[kb], c[kc], d[kd]]',
        ['kb', 'kc', 'kd'],
      ],
    ])(
      'matches the literal-key form for every input: %s',
      async (_label, styleExpr, names) => {
        const actual = await classExpr(styleExpr);
        for (const combo of combosOf(names as string[])) {
          const reference = await classExpr(literal(styleExpr, combo));
          expect(evaluate(actual, combo)).toBe(evaluate(reference, combo));
        }
      },
    );
  });
});
