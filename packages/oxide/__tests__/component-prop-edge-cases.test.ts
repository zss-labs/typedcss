import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  evaluateModule,
  implementations,
  renderProps,
} from './implementations';

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-component-prop-edge-')),
  );
  let count = 0;

  const HEAD = `import * as css from '@typedcss/css';
const s = css.create({
  a: { color: 'red' },
  b: { padding: 4 },
  fn: (size: number) => ({ width: size }),
  named: ({ tone }: { tone: string }) => ({ color: tone }),
});
const Card = ({ cardStyle }: { cardStyle?: css.Style }) => <div sx={cardStyle} />;
`;

  const transform = async (files: Record<string, string>) => {
    const cwd = path.join(DIR, String(count++));
    for (const [name, source] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), source);
    }
    const filePath = path.join(cwd, 'app.tsx');
    const { code } = await transformSource({
      source: files['app.tsx'],
      moduleId: filePath,
      filePath,
      root: cwd,
      cwd,
      isDev: false,
    });
    return {
      code,
      css: compileCSS({ include: ['**/*.{ts,tsx}'], exclude: [], cwd }),
    };
  };

  const app = (body: string) => transform({ 'app.tsx': HEAD + body });

  const RED = 'xq96bg3w';

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  // Plumeria relays a style through a component prop as a key into a table it
  // writes at build time. typedcss passes the style value itself and merges it
  // on the element, so each case renders and checks what the element receives.
  const render = (
    code: string,
    props: Record<string, unknown> = {},
    load?: (name: string) => unknown,
  ) => renderProps(code, props, 'A', load);

  describe('component prop: a condition written with a literal', () => {
    it.each([
      ['a conditional on true', 'true ? s.a : s.b', RED],
      ['false && a style', 'false && s.a', ''],
      ['true && a style', 'true && s.a', RED],
    ])('keys %s', async (_name, value, expected) => {
      const { code } = await app(
        `export const A = () => <Card cardStyle={${value}} />;`,
      );
      expect(render(code).className ?? '').toBe(expected);
    });
  });

  describe('component prop: a branch it cannot read', () => {
    it('keys the branch it can read beside a name it cannot', async () => {
      const { code } = await app(
        `export const A = ({ on, other }: any) => <Card cardStyle={on ? s.a : other} />;`,
      );
      expect(render(code, { on: true }).className).toBe(RED);
      expect(render(code, { on: false }).className ?? '').toBe('');
    });

    it.each([
      ['a name under &&', 'on && other'],
      ['null and false', 'on ? null : false'],
      ['a spread in an array', '[...list]'],
    ])('registers nothing for %s', async (_name, value) => {
      const { code } = await app(
        `export const A = ({ on, other, list }: any) => <Card cardStyle={${value}} />;`,
      );
      expect(render(code, { on: true, list: [] }).className ?? '').toBe('');
      expect(code.replace(/\s+/g, '')).toContain(
        `<CardcardStyle={${value.replace(/\s+/g, '')}}/>`,
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a fallback written with || applies whichever style it yields.
    it.skip('rejects a fallback written with ||', async () => {
      await expect(
        app(
          `export const A = ({ on }: any) => <Card cardStyle={on || s.a} />;`,
        ),
      ).rejects.toThrow(
        '[typedcss] Style prop fallbacks using || or ?? cannot be resolved. Use a conditional expression with defined styles.',
      );
    });
  });

  describe('component prop: a function key', () => {
    const p = { on: true, n: 4, t: 'blue' };
    it.each([
      ['a named argument', 's.named({ tone: p.t })', ['blue']],
      ['a conditional beside a static key', 'p.on ? s.fn(p.n) : s.a', ['4px']],
      ['&&', 'p.on && s.fn(p.n)', ['4px']],
      ['true &&', 'true && s.fn(p.n)', ['4px']],
      ['false &&', 'false && s.fn(p.n)', []],
      [
        'an array with a condition',
        '[s.a, p.on && s.b, null, s.fn(p.n)]',
        ['4px'],
      ],
    ])(
      'reads the key and its variables for %s',
      async (_name, value, values) => {
        const { code } = await app(
          `export const A = (p: any) => <Card cardStyle={${value}} />;`,
        );
        expect(Object.values(render(code, p).style ?? {})).toEqual(values);
      },
    );

    it('keys both branches of a conditional beside a static key', async () => {
      const { code } = await app(
        `export const A = (p: any) => <Card cardStyle={p.on ? s.fn(p.n) : s.a} />;`,
      );
      expect(render(code, { ...p }).className).toMatch(/^x[a-z0-9]+$/);
      expect(render(code, { ...p }).className).not.toBe(RED);
      expect(render(code, { ...p, on: false }).className).toBe(RED);
    });

    // Not a typedcss requirement: typedcss calls the function key at runtime, so a spread argument reaches it as written.
    it.skip('rejects a named argument written as a spread', async () => {
      await expect(
        app(
          `export const A = ({ rest }: any) => <Card cardStyle={s.named({ ...rest })} />;`,
        ),
      ).rejects.toThrow(
        '[typedcss] s.named({ ...rest }) is only supported in the sx prop.',
      );
    });
  });

  describe('component prop: the shape of the receiving component', () => {
    it('reads a defaulted parameter that names the prop twice', async () => {
      const { code } = await transform({
        'app.tsx': `import * as css from '@typedcss/css';
const s = css.create({ a: { color: 'red' } });
const Card = ({ cardStyle, cardStyle: again }: { cardStyle?: css.Style } = {}) => <div sx={cardStyle} />;
export const A = () => <Card cardStyle={s.a} />;`,
      });
      expect(render(code).className).toBe(RED);
    });

    it('reads anonymous default exports of other files', async () => {
      const files = {
        'widget.tsx': `import '@typedcss/css';
export default class { render() { return null; } }`,
        'box.tsx': `import * as css from '@typedcss/css';
export default function ({ boxStyle }: { boxStyle?: css.Style }) { return <div sx={boxStyle} />; }`,
        'app.tsx': `import * as css from '@typedcss/css';
import Widget from './widget';
import Box from './box';
const s = css.create({ a: { color: 'red' } });
export const A = () => <><Widget /><Box boxStyle={s.a} /></>;`,
      };
      const { code, css } = await transform(files);
      const box = await transformSource({
        source: files['box.tsx'],
        filePath: path.join(DIR, 'box.tsx'),
        root: DIR,
      });
      const load = (name: string) =>
        name === './box'
          ? evaluateModule(box.code)
          : name === './widget'
            ? { default: () => null }
            : undefined;
      expect(render(code, {}, load).className).toBe(RED);
      expect(css).toContain('{ color: red; }');
    });
  });

  describe('component prop: imports the scan does not follow', () => {
    it('passes over a barrel that re-exports the core package and names it cannot resolve', async () => {
      const { code } = await transform({
        'barrel.ts': `export { create } from '@typedcss/css';
export * from '@typedcss/css';
export * from './missing';
export { nope } from 'unknown-package';`,
        'app.tsx': `import * as css from '@typedcss/css';
import * as barrel from './barrel';
const s = css.create({ a: { color: 'red' } });
export const A = () => <div sx={s.a} data-b={barrel} />;`,
      });
      expect(code).toContain(`import * as barrel from './barrel';`);
      expect(render(code, {}, () => ({})).className).toBe(RED);
    });

    it('leaves a namespace import of a file without definitions as written', async () => {
      const { code } = await transform({
        'styles.ts': `export const colors = { a: 'teal' };`,
        'app.tsx': `import * as css from '@typedcss/css';
import * as ns from './styles';
const s = css.create({ a: { color: 'red' } });
export const A = () => <div sx={s.a} data-n={ns} />;`,
      });
      expect(code).toContain(`import * as ns from './styles';`);
      expect(render(code, {}, () => ({})).className).toBe(RED);
    });
  });
});
