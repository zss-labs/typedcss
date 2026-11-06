import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  implementations,
  renderClass,
  evaluateModule,
  hostElement,
  loadProject,
  getStyleRecords,
} from './implementations';

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-transform-edge-')),
  );
  let count = 0;

  const HEAD = `import * as css from '@typedcss/css';
const s = css.create({
  a: { color: 'red' },
  b: { padding: 4 },
  fn: (size: number) => ({ width: size }),
  named: ({ tone }: { tone: string }) => ({ color: tone }),
});
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
    last = { cwd, files };
    return {
      code,
      css: compileCSS({ include: ['**/*.{ts,tsx}'], exclude: [], cwd }),
    };
  };
  let last = { cwd: '', files: {} as Record<string, string> };

  // Transforms every file of the last project and links them, so a module can
  // be rendered through the ones it imports.
  const linked = async (files: Record<string, string>) => {
    const codes: Record<string, string> = {};
    for (const [name, source] of Object.entries(files)) {
      const filePath = path.join(last.cwd, name);
      codes[filePath] = (
        await transformSource({
          source,
          moduleId: filePath,
          filePath,
          root: last.cwd,
          cwd: last.cwd,
          isDev: false,
        })
      ).code;
    }
    return loadProject(codes)(path.join(last.cwd, 'app.tsx'));
  };

  const app = (body: string) => transform({ 'app.tsx': HEAD + body });

  const RED = 'xq96bg3w';
  const PADDING = 'x8ti24uy';

  // typedcss merges at runtime, so the class is read off the rendered element.
  const classOf = (
    code: string,
    props: Record<string, unknown> = {},
    name = 'A',
  ) =>
    renderClass(code, props, name).split(' ').filter(Boolean).sort().join(' ');
  const classOfElement = (node: unknown) =>
    String(hostElement(node)?.props.className ?? '')
      .split(' ')
      .filter(Boolean)
      .sort()
      .join(' ');
  const elements = (
    code: string,
    props: Record<string, unknown> = {},
    name = 'A',
  ) => {
    const found: Record<string, any>[] = [];
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node.type === 'function') return walk(node.type(node.props));
      if (typeof node.type === 'string' && node.type !== 'fragment')
        found.push({
          ...node.props,
          style: Object.fromEntries(
            Object.entries(node.props.style ?? {}).filter(
              ([, v]) => v !== undefined,
            ),
          ),
        });
      walk(node.props?.children);
    };
    walk(evaluateModule(code)[name](props));
    return found;
  };
  const varsOf = (
    code: string,
    props: Record<string, unknown> = {},
    name = 'A',
  ) =>
    elements(code, props, name)
      .flatMap((el) => Object.values(el.style).map(String))
      .sort();
  const BLUE_CLASS = getStyleRecords({ color: 'blue' } as never)[0].hash;
  const GREEN_CLASS = getStyleRecords({ color: 'green' } as never)[0].hash;

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  describe('transform: how the core package is imported', () => {
    it('leaves a type-only import in place', async () => {
      const { code, css } = await transform({
        'app.tsx': `import type { Style } from '@typedcss/css';
export const A = ({ x }: { x?: Style }) => <div sx={x} />;`,
      });
      expect(code).toContain(`import type { Style } from '@typedcss/css';`);
      expect(classOf(code)).toBe('');
      expect(css).toBe('');
    });

    it('keeps only the types of an import that mixes them with values', async () => {
      const { code } = await transform({
        'app.tsx': `import { type Style, type CSSProperties as P, create as make } from '@typedcss/css';
const s = make({ a: { color: 'red' } });
export const A = ({ x }: { x?: Style; p?: P }) => <div sx={s.a} />;`,
      });
      // typedcss keeps the core import, which carries the runtime.
      expect(code).toContain('type Style, type CSSProperties as P');
      expect(code).not.toContain('make(');
      expect(classOf(code)).toBe(`${RED}`);
    });

    it('reads a style object imported under another name', async () => {
      const files = {
        'styles.ts': `import * as css from '@typedcss/css';
export const styles = css.create({ a: { color: 'teal' } });`,
        'app.tsx': `import '@typedcss/css';
import { styles as st, missing } from './styles';
export const A = () => <div sx={st.a} />;`,
      };
      const { css } = await transform(files);
      expect(classOfElement((await linked(files)).A())).toMatch(/^x[a-z0-9]+$/);
      expect(css).toContain('color: teal');
    });

    it('leaves a create call on another object alone', async () => {
      const { code } = await app(
        `const other: any = { create: (x: any) => x };
const o = other.create({ a: { color: 'blue' } });
export const A = () => <div sx={s.a} />;`,
      );
      expect(code).toMatch(/other\.create\(\{\s*a: \{\s*color: 'blue'/);
      expect(classOf(code)).toBe(`${RED}`);
    });
  });

  describe('transform: a style that is not there', () => {
    it('reads undefined as no class', async () => {
      const { code } = await app(
        `export const A = () => <div sx={undefined} />;`,
      );
      expect(classOf(code)).toBe('');
    });

    it('reads undefined in an array as no entry', async () => {
      const { code } = await app(
        `export const A = () => <div sx={[s.a, undefined]} />;`,
      );
      expect(classOf(code)).toBe(`${RED}`);
    });

    it('skips a hole in an array under a condition', async () => {
      const { code } = await app(
        `export const A = ({ on }: any) => <div sx={[on && [s.a, , s.b]]} />;`,
      );
      expect(classOf(code, { on: true })).toBe([RED, PADDING].sort().join(' '));
      expect(classOf(code, { on: false })).toBe('');
    });

    // Not a typedcss requirement: typedcss emits every style a file defines.
    it.skip('leaves a keyframes call without an object alone', async () => {
      const { code, css } = await app(
        `const frames: any = {}; const k = css.keyframes(frames);`,
      );
      expect(code).toContain('const k = css.keyframes(frames);');
      expect(css).toBe('');
    });
  });

  describe('transform: what it rejects', () => {
    it.each([
      [
        'a destructured create call',
        `const { a } = css.create({ a: { color: 'blue' } });`,
        '[typedcss] css.create must be assigned to a named top-level variable.',
      ],
    ])('rejects %s', async (_name, body, message) => {
      await expect(app(body)).rejects.toThrow(message);
    });
    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip.each([
      [
        'a function key the style object does not hold',
        `export const A = () => <div sx={s.nope(1)} />;`,
        '[typedcss] Dynamic or unresolvable style object "s.nope(1)" is not supported.',
      ],
      [
        'a function key called with a spread',
        `export const A = ({ args }: any) => <div sx={s.fn(...args)} />;`,
        '[typedcss] Dynamic or unresolvable style object "s.fn(...args)" is not supported.',
      ],
      [
        'a spread in an array under a condition',
        `export const A = ({ on, list }: any) => <div sx={[on && [...list]]} />;`,
        '[typedcss] Spread elements in a style array are not supported: "...list".',
      ],
      [
        'a constant that names another constant',
        `const x = s.a; const y = x; export const A = () => <div sx={y} />;`,
        '[typedcss] Dynamic or unresolvable style object "y" is not supported.',
      ],
    ])('rejects %s', async (_name, body, message) => {
      await expect(app(body)).rejects.toThrow(message);
    });
  });

  describe('transform: the arguments of a function key', () => {
    it('ignores an argument past the last parameter', async () => {
      const { code } = await app(
        `export const A = ({ n }: any) => <div sx={s.fn(n, 2)} />;`,
      );
      expect(varsOf(code, { n: 3 })).toEqual(['3px']);
    });

    it.each([`s.fn("3")`, `s.fn('3')`])(
      'passes the string literal of %s through as written',
      async (call) => {
        const { code } = await app(
          `export const A = () => <div sx={${call}} />;`,
        );
        expect(varsOf(code)).toEqual(['3']);
      },
    );

    it('joins the unit a declaration writes onto each kind of argument', async () => {
      const { code } = await transform({
        'app.tsx': `import * as css from '@typedcss/css';
const s = css.create({ fn: (size: number) => ({ width: \`\${size}px\`, height: size }) });
export const A = ({ n }: any) => <><i sx={s.fn("3")} /><b sx={s.fn(n)} /><u sx={s.fn(4)} /></>;`,
      });
      const [i, b] = elements(code, { n: 5 });
      expect(Object.values(i.style)).toContain('3px');
      expect(Object.values(b.style)).toContain('5px');
    });

    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('emits no class for an object handed to a positional parameter at runtime', async () => {
      const { code } = await app(
        `export const A = ({ n }: any) => <div sx={s.fn({ size: n })} />;`,
      );
      expect(classOf(code)).toBe('');
    });

    it('hands a function key to a component as a key and its variables', async () => {
      // typedcss passes the style itself, so the component renders its class
      // and its variable.
      const { code } = await app(
        `const Card = ({ cardStyle }: { cardStyle?: css.Style }) => <div sx={cardStyle} />;
export const A = ({ n }: any) => <Card cardStyle={s.fn(n)} />;`,
      );
      const [div] = elements(code, { n: 3 });
      expect(div.className).toMatch(/^x[a-z0-9]+$/);
      expect(Object.values(div.style)).toEqual(['3px']);
    });
  });

  describe('transform: conditions', () => {
    it('keys a conditional nested in another by its path', async () => {
      const { code } = await app(
        `export const A = ({ a, b }: any) => <div sx={a ? (b ? s.a : s.b) : s.b} />;`,
      );
      expect(classOf(code, { a: true, b: true })).toBe(RED);
      expect(classOf(code, { a: true, b: false })).toBe(PADDING);
      expect(classOf(code, { a: false, b: true })).toBe(PADDING);
    });

    it('reads through parentheses', async () => {
      const { code } = await app(
        `export const A = ({ on }: any) => <div sx={[(on && s.a), (s.b)]} />;`,
      );
      expect(classOf(code, { on: true })).toBe([RED, PADDING].sort().join(' '));
      expect(classOf(code, { on: false })).toBe(PADDING);
    });
  });

  describe('transform: names and components', () => {
    it('does not follow a constant into a scope that shadows its name', async () => {
      const { code } = await app(
        `const local = s.a;
export const A = ({ local }: any) => <div sx={local} />;
export const B = () => <div sx={local} />;`,
      );
      expect(classOf(code, {}, 'A')).toBe('');
      expect(classOf(code, {}, 'B')).toBe(RED);
    });

    it('reads an anonymous default component that receives a style', async () => {
      const { code } = await app(
        `export default function ({ boxStyle }: { boxStyle?: css.Style }) { return <div sx={boxStyle} />; }`,
      );
      expect(classOf(code, {}, 'default')).toBe('');
      expect(
        classOf(code, { boxStyle: { color: RED, $$css: true } }, 'default'),
      ).toBe(RED);
    });

    it('reads a defaulted prop beside patterns it does not name', async () => {
      const { code } = await app(
        `const k = 'x';
const Card = ({ a: { b }, [k]: v, 'q': quoted, c: d = s.a }: any) => <div sx={d} />;
export const A = () => <Card a={{}} c={s.b} />;
export const B = () => <Card a={{}} />;`,
      );
      expect(classOf(code, {}, 'A')).toBe(PADDING);
      expect(classOf(code, {}, 'B')).toBe(RED);
    });

    it('passes over a wrapper call that holds no component', async () => {
      const { code } = await app(
        `const Card = memo(config);
export const A = () => <div sx={s.a} />;`,
      );
      expect(code).toContain('const Card = memo(config);');
      expect(code).toContain('__typedcss_props(s.a)');
    });

    // Not a typedcss requirement: the definition's variable is kept instead of writing its value in place.
    it.skip('empties a style object exported through a specifier list', async () => {
      const { code } = await app(
        `const Card = ({ cardStyle }: { cardStyle?: css.Style }) => <div sx={cardStyle} />;
export { Card, s as styles };
export const A = () => <Card cardStyle={s.a} />;`,
      );
      expect(code).toContain('const s = "";');
      expect(code).toContain('export { Card, s as styles };');
    });
  });

  describe('transform: the attributes beside the style prop', () => {
    const FN = `const d = css.create({ fn: (size: number) => ({ width: size }) });\n`;
    const SIZE = `"--[a-z0-9]+-size": \\(typeof \\(n\\) === 'number' \\? \\(n\\) \\+ 'px' : \\(n\\)\\)`;

    it('keeps a namespaced attribute', async () => {
      const { code } = await app(
        `export const A = (p: any) => <svg xlink:href="x" sx={s.a} />;`,
      );
      const [svg] = elements(code);
      expect(svg['xlink:href']).toBe('x');
      expect(svg.className).toBe(RED);
    });

    it('keeps a spread attribute', async () => {
      const { code } = await app(
        `export const A = (p: any) => <div {...p} sx={s.a} />;`,
      );
      const [div] = elements(code, { id: 'q' });
      expect(div.id).toBe('q');
      expect(div.className).toBe(RED);
    });

    // Not a typedcss requirement: sx together with className or style on the same element is rejected.
    it.skip.each([
      ['a className without a value', `<div className sx={s.a} />`],
      ['a className string', `<div className="x" sx={s.a} />`],
      ['a className expression', `<div className={p.c} sx={s.a} />`],
      [
        'a className beside a style that is not there',
        `<div className="x" sx={undefined} />`,
      ],
    ])('keeps %s', async (_name, element) => {
      await app(`export const A = (p: any) => ${element};`);
    });

    // Not a typedcss requirement: a style prop written as a string or with no value is a type error under css.Style.
    it.skip.each([
      ['a string', `sx="x"`],
      ['no value', `sx`],
    ])(
      'leaves a style prop written with %s alone',
      async (_name, attribute) => {
        const { code, css } = await app(
          `export const A = () => <div ${attribute} />;`,
        );
        expect(code).toContain(`<div ${attribute} />`);
        expect(css).toBe('');
      },
    );

    // Not a typedcss requirement: sx together with className or style on the same element is rejected.
    it.skip.each([
      ['a string', `style="color:red"`, ''],
      ['an object', `style={{ top: 1, ...rest }}`, 'top: 1, \\.\\.\\.rest, '],
      ['a name', `style={st}`, '\\.\\.\\.\\(st\\), '],
    ])(
      'merges the variables of a function key into a style attribute written as %s',
      async (_name, attribute, kept) => {
        const { code } = await app(
          FN +
            `export const A = ({ n, rest, st }: any) => <div ${attribute} sx={d.fn(n)} />;`,
        );
        expect(code).toMatch(new RegExp(`style=\\{\\{ ${kept}${SIZE} \\}\\}`));
      },
    );
  });

  describe('transform: a definition read as a value', () => {
    const DEFINITIONS = `const statics = css.createStatic({ gap: 4 });
const theme = css.createTheme('.dark', { color: { default: 'black', theme: 'white' } });
const k = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const vt = css.viewTransitionClass({ old: { opacity: 0 } });
`;

    // typedcss keeps each definition as its runtime value, so the module is
    // evaluated and the value read off it.
    it.each([
      ['a createStatic object', 'statics', { gap: 4 }],
      ['a createStatic key', 'statics.gap', 4],
      ['a createStatic key it does not hold', 'statics.zzz', undefined],
      [
        'a createTheme object',
        'theme',
        { color: expect.stringMatching(/^var\(--x[a-z0-9]+-color\)$/) },
      ],
      [
        'a createTheme key',
        'theme.color',
        expect.stringMatching(/^var\(--x[a-z0-9]+-color\)$/),
      ],
      ['a style key', 's.a', { color: RED, $$css: true }],
    ])('writes out %s', async (_name, read, value) => {
      const { code } = await app(DEFINITIONS + `export const value = ${read};`);
      expect(evaluateModule(code).value).toEqual(value);
    });

    it('writes out a keyframes and a viewTransitionClass by their hashes', async () => {
      const { code } = await app(DEFINITIONS + `export const all = [k, vt];`);
      expect(evaluateModule(code).all).toEqual([
        expect.stringMatching(/^kf-x[a-z0-9]+$/),
        expect.stringMatching(/^vt-x[a-z0-9]+$/),
      ]);
    });

    it('writes out definitions imported from another file', async () => {
      const files = {
        'tokens.ts': `import * as css from '@typedcss/css';
export const statics = css.createStatic({ gap: 4 });
export const theme = css.createTheme('.dark', { color: { default: 'black', theme: 'white' } });
export const styles = css.create({ a: { color: 'red' } });`,
        'app.tsx': `import '@typedcss/css';
import { statics, theme, styles } from './tokens';
export const all = [statics, statics.gap, statics.zzz, theme, theme.color, styles, styles.a, styles.zzz];`,
      };
      await transform(files);
      const color = expect.stringMatching(/^var\(--x[a-z0-9]+-color\)$/);
      const a = { color: RED, $$css: true };
      expect((await linked(files)).all).toEqual([
        { gap: 4 },
        4,
        undefined,
        { color },
        color,
        { a },
        a,
        undefined,
      ]);
    });

    it('reads a whole style object in the style prop as no class', async () => {
      const { code } = await app(`export const A = () => <div sx={s} />;`);
      expect(classOf(code)).toBe('');
    });
  });

  describe('transform: css.use', () => {
    // Not a typedcss requirement: typedcss has no css.use.
    it.skip.each([
      ['several styles', 'css.use(s.a, s.b)', `"${RED} ${PADDING}"`],
      ['no argument', 'css.use()', '""'],
      ['a condition', 'css.use(p && s.a)', `((p) ? "${RED}" : "")`],
    ])('compiles %s', async (_name, call, expected) => {
      const { code } = await app(
        `declare const p: boolean; export const cls = ${call};`,
      );
      expect(code).toContain(`export const cls = ${expected};`);
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('compiles a call through a named import', async () => {
      const { code } = await transform({
        'app.tsx': `import { create, use } from '@typedcss/css';
const s = create({ a: { color: 'red' } });
export const cls = use(s.a);`,
      });
      expect(code).toContain(`export const cls = "${RED}";`);
    });

    it('leaves a call whose callee is not a name alone', async () => {
      const { code } = await app(
        `const v = (() => 1)(); export const A = () => <div sx={s.a} />;`,
      );
      expect(code).toMatch(/const v = \(\(\)\s*=>\s*1\)\(\);/);
    });
  });

  describe('transform: conditions that set the same property', () => {
    const BLUE = `const t = css.create({ c: { color: 'blue' } });\n`;

    it('looks two conditions up together', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ x, y }: any) => <div sx={[x && s.a, y && t.c]} />;`,
      );
      expect(classOf(code, { x: true, y: false })).toBe(RED);
      expect(classOf(code, { x: false, y: true })).toBe(BLUE_CLASS);
      expect(classOf(code, { x: true, y: true })).toBe(BLUE_CLASS);
      expect(classOf(code, { x: false, y: false })).toBe('');
    });

    it('looks two comparisons of one name up together', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ v }: any) => <div sx={[v === 'a' && s.a, v === 'c' && t.c]} />;`,
      );
      expect(classOf(code, { v: 'a' })).toBe(RED);
      expect(classOf(code, { v: 'c' })).toBe(BLUE_CLASS);
      expect(classOf(code, { v: 'z' })).toBe('');
    });

    it('keeps a base the conditions do not touch outside the lookup', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ v, on }: any) => <div sx={[s.b, v === 'a' && s.a, v === 'c' && t.c, on && s.b]} />;`,
      );
      expect(classOf(code, { v: 'a', on: true })).toBe(
        [PADDING, RED].sort().join(' '),
      );
      expect(classOf(code, { v: 'z', on: false })).toBe(PADDING);
    });

    it('widens the lookup for a third condition', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ v, y }: any) => <div sx={[v === 'a' && s.a, v === 'c' && t.c, y ? s.a : t.c]} />;`,
      );
      expect(classOf(code, { v: 'c', y: true })).toBe(RED);
      expect(classOf(code, { v: 'a', y: false })).toBe(BLUE_CLASS);
    });
  });

  describe('transform: one parameter written with several units', () => {
    const local = (declaration: string) =>
      transform({
        'app.tsx': `import * as css from '@typedcss/css';
const st = css.create(${declaration});
export const A = (p: any) => <div sx={st.fn(p.n)} />;`,
      });

    it('names a second unit on one property after the unit', async () => {
      const { code } = await local(
        "{ fn: (size: number) => ({ width: `${size}px`, ':hover': { width: `${size}%` }, ':focus': { width: size } }) }",
      );
      expect(varsOf(code, { n: 2 })).toEqual(['2%', '2px', '2px']);
    });

    it('names a percentage on a unitless property in words', async () => {
      const { code } = await local(
        "{ fn: (n: number) => ({ lineHeight: n, ':hover': { lineHeight: `${n}px` }, ':focus': { lineHeight: `${n}%` } }) }",
      );
      expect(varsOf(code, { n: 2 })).toEqual(['2', '2%', '2px']);
    });

    it('shares one variable between declarations that write the same unit', async () => {
      const { code } = await local(
        "{ fn: (n: number) => ({ width: `${n}px`, ':hover': { width: `${n}px` }, height: `${n}%` }) }",
      );
      expect(varsOf(code, { n: 2 })).toEqual(['2%', '2px']);
    });
  });

  describe('transform: an imported function key that reads names around it', () => {
    const imported = (declaration: string, lead: string, call = 'st.fn(p.n)') =>
      transform({
        'styles.ts': `import * as css from '@typedcss/css';
${lead}
export const st = css.create(${declaration});`,
        'app.tsx': `import '@typedcss/css';
import { st } from './styles';
export const A = (p: any) => <div sx={${call}} />;`,
      });

    it.each([
      [
        'a template literal',
        '{ fn: (n: number) => ({ width: `calc(${n}px + ${GAP}px)`, color: TONE }) }',
        `const GAP = 4;\nconst TONE = 'red';`,
        /\{ width: calc\(var\(--[a-z0-9]+-n\) \+ 4px\); \}[\s\S]*\{ color: red; \}/,
      ],
      [
        'a block body',
        '{ fn: (n: number) => { return { width: n, color: TONE }; } }',
        `const TONE = 'red';`,
        /\{ width: var\(--[a-z0-9]+-n\); \}[\s\S]*\{ color: red; \}/,
      ],
      [
        'a function expression',
        '{ fn: function (n: number) { return { width: n, padding: GAP }; } }',
        `const GAP = 4;`,
        /\{ width: var\(--[a-z0-9]+-n\); \}[\s\S]*\{ padding: 4px; \}/,
      ],
      [
        'a parameter default',
        '{ fn: (n: number = GAP) => ({ width: n }) }',
        `const GAP = 4;`,
        /\{ width: var\(--[a-z0-9]+-n, 4px\); \}/,
      ],
      [
        'a shorthand property',
        '{ fn: (n: number) => ({ width: n, color }) }',
        `const color = 'red';`,
        /\{ color: red; \}/,
      ],
      [
        'members and a spread of objects',
        '{ fn: (n: number) => ({ width: n, color: TOKENS.tone, margin: TOKENS.deep.gap, ...BASE }) }',
        `const TOKENS = { tone: 'red', deep: { gap: 4 } };\nconst BASE = { display: 'flex' };`,
        /\{ color: red; \}[\s\S]*\{ margin: 4px; \}[\s\S]*\{ display: flex; \}/,
      ],
    ])('resolves %s', async (_name, declaration, lead, expected) => {
      const { css } = await imported(declaration, lead);
      expect(css).toMatch(expected);
    });

    it.each([
      [
        'an array pattern and a rest parameter',
        '{ fn: ([a]: number[], ...rest: number[]) => ({ width: a }) }',
        'st.fn(p.n)',
      ],
      [
        'a rest element in a named parameter',
        '{ fn: ({ tone, ...rest }: any) => ({ color: tone }) }',
        'st.fn({ tone: p.t })',
      ],
    ])('rejects %s', async (_name, declaration, call) => {
      await expect(imported(declaration, '', call)).rejects.toThrow(
        '[typedcss] Dynamic styles require named parameters or object destructuring; array and rest parameters are not supported.',
      );
    });
  });

  describe('transform: values read through other definitions', () => {
    it('names a keyframes and a viewTransitionClass inside a style', async () => {
      const { css } = await transform({
        'app.tsx': `import * as css from '@typedcss/css';
const k = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const vt = css.viewTransitionClass({ old: { opacity: 0 } });
const st = css.create({ a: { animationName: k, viewTransitionName: vt } });
export const A = () => <div sx={st.a} />;`,
      });
      expect(css).toMatch(/@keyframes kf-x[a-z0-9]+ \{/);
      expect(css).toMatch(/::view-transition-old\(\*\.vt-x[a-z0-9]+\) \{/);
    });

    it('names a keyframes read through a namespace import', async () => {
      const { css } = await transform({
        'anim.ts': `import * as css from '@typedcss/css';
export const k = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
        'app.tsx': `import * as css from '@typedcss/css';
import * as anim from './anim';
const st = css.create({ a: { animationName: anim.k } });
export const A = () => <div sx={st.a} />;`,
      });
      expect(css).toMatch(/@keyframes kf-x[a-z0-9]+ \{/);
      expect(css).toMatch(/animation-name: kf-x[a-z0-9]+;/);
    });

    it.each([
      [
        'a createStatic value read through two quoted keys',
        {
          'app.tsx': `import * as css from '@typedcss/css';
const bp = css.createStatic({ n: { gap: 4 } });
const st = css.create({ a: { margin: bp['n']['gap'] } });
export const A = () => <div sx={st.a} />;`,
        },
        `Cannot resolve the value of "margin" at build time (bp['n']['gap']).`,
      ],
    ])('rejects %s', async (_name, files, message) => {
      await expect(transform(files)).rejects.toThrow(message);
    });

    it('spreads an object constant and passes over one that is not an object', async () => {
      const { css } = await transform({
        'app.tsx': `import * as css from '@typedcss/css';
const base = { color: 'red' };
const num = 4;
const st = css.create({ a: { ...base, ...num, padding: 1 } });
export const A = () => <div sx={st.a} />;`,
      });
      expect(css).toContain('{ color: red; }');
      expect(css).toContain('{ padding: 1px; }');
    });
  });

  describe('transform: no cwd given', () => {
    it('scans the directory the process is running in', async () => {
      const project = path.join(DIR, 'default-cwd');
      fs.mkdirSync(project);
      fs.writeFileSync(
        path.join(project, 'card.tsx'),
        `import * as css from '@typedcss/css';
export const Card = ({ cardStyle }: { cardStyle?: css.Style }) => <div sx={cardStyle} />;`,
      );
      const source = `import * as css from '@typedcss/css';
import { Card } from './card';
const s = css.create({ a: { color: 'red' } });
export const A = () => <Card cardStyle={s.a} />;`;
      const filePath = path.join(project, 'app.tsx');
      fs.writeFileSync(filePath, source);

      const previous = process.cwd();
      process.chdir(project);
      try {
        const { code } = await transformSource({
          source,
          moduleId: filePath,
          filePath,
          root: project,
          isDev: false,
        });
        const card = await transformSource({
          source: fs.readFileSync(path.join(project, 'card.tsx'), 'utf8'),
          moduleId: path.join(project, 'card.tsx'),
          filePath: path.join(project, 'card.tsx'),
          root: project,
          isDev: false,
        });
        const rendered = loadProject({
          [filePath]: code,
          [path.join(project, 'card.tsx')]: card.code,
        })(filePath).A();
        expect(classOfElement(rendered)).toBe(RED);
      } finally {
        process.chdir(previous);
      }
    });
  });

  describe('transform: a spread inside a style', () => {
    const declared = (declaration: string, lead = '') =>
      transform({
        'app.tsx': `import * as css from '@typedcss/css';
${lead}
const st = css.create(${declaration});
export const A = () => <div sx={st.a} />;`,
      });

    it.each([
      [
        'an object constant, which a later key overrides',
        `{ a: { ...base, color: 'red' } }`,
        `const base = { padding: 2, color: 'blue' };`,
        ['{ padding: 2px; }', '{ color: red; }'],
      ],
      [
        'an object constant, which overrides an earlier key',
        `{ a: { color: 'red', ...base } }`,
        `const base = { padding: 2, color: 'blue' };`,
        ['{ padding: 2px; }', '{ color: blue; }'],
      ],
      [
        'a member of an object constant',
        `{ a: { ...base.inner, color: 'red' } }`,
        `const base = { inner: { padding: 2 } };`,
        ['{ padding: 2px; }', '{ color: red; }'],
      ],
    ])('reads %s', async (_name, declaration, lead, rules) => {
      const { css } = await declared(declaration, lead);
      for (const rule of rules) expect(css).toContain(rule);
    });

    it.each([
      [
        'a call',
        `{ a: { ...make(), color: 'red' } }`,
        '[typedcss] Cannot spread a function call at build time.',
      ],
      [
        'a name it cannot resolve',
        `{ a: { ...missing, color: 'red' } }`,
        '[typedcss] Cannot resolve static value: missing.',
      ],
      [
        'an object literal',
        `{ a: { ...({ padding: 2 }), color: 'red' } }`,
        '[typedcss] Unsupported expression type: an object literal.',
      ],
      [
        'a conditional expression',
        `{ a: { ...(flag ? { padding: 2 } : {}), color: 'red' } }`,
        '[typedcss] Unsupported expression type: a conditional expression.',
      ],
    ])('rejects %s', async (_name, declaration, message) => {
      await expect(declared(declaration, 'const flag = true;')).rejects.toThrow(
        message,
      );
    });
  });

  describe('transform: a style object it cannot see', () => {
    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip.each([
      [
        'a function key behind two members',
        `const lib: any = {}; export const A = () => <div sx={[s.a, lib.styles.fn(1)]} />;`,
        'lib.styles.fn(1)',
      ],
      [
        'a function key on the result of a call',
        `const get = (): any => s; export const A = () => <div sx={[s.a, get().fn(1)]} />;`,
        'get().fn(1)',
      ],
      [
        'a function key on a parameter that shadows the style object',
        `export const A = ({ s }: any) => <div sx={s.fn(1)} />;`,
        's.fn(1)',
      ],
      [
        'a static key on a parameter that shadows the style object',
        `export const A = ({ s }: any) => <div sx={s.a} />;`,
        's.a',
      ],
    ])('rejects %s', async (_name, body, source) => {
      await expect(app(body)).rejects.toThrow(
        `[typedcss] Dynamic or unresolvable style object "${source}" is not supported.`,
      );
    });
  });

  describe('transform: where a component reads the style it receives', () => {
    const TABLE = `{"xdeb8kup":"${RED}"}`;

    it.each([
      [
        'a member of the props object',
        `(props: { cardStyle?: css.Style }) => <div sx={props.cardStyle} />`,
        `(${TABLE}[props.cardStyle] || "")`,
      ],
      [
        'a name destructured in the body',
        `(props: { cardStyle?: css.Style }) => { const { cardStyle } = props; return <div sx={cardStyle} />; }`,
        `(${TABLE}[cardStyle] || "")`,
      ],
      [
        'a function nested in the component',
        `({ cardStyle }: { cardStyle?: css.Style }) => { const inner = () => <div sx={cardStyle} />; return inner(); }`,
        `(${TABLE}[cardStyle] || "")`,
      ],
    ])('looks the key up through %s', async (_name, component) => {
      // typedcss passes the style itself, so the component renders it.
      const { code } = await app(
        `const Card = ${component};
export const A = () => <Card cardStyle={s.a} />;`,
      );
      expect(classOf(code)).toBe(RED);
    });

    it('joins a base with a received array that holds a function key', async () => {
      const { code } = await app(
        `const Card = ({ cardStyle }: { cardStyle?: css.Style }) => <div sx={[s.b, cardStyle]} />;
export const A = ({ n, on }: any) => <Card cardStyle={[on && s.a, s.fn(n)]} />;`,
      );
      const [div] = elements(code, { n: 3, on: true });
      expect(div.className.split(' ')).toEqual(
        expect.arrayContaining([PADDING, RED]),
      );
      expect(div.className.split(' ')).toHaveLength(3);
      expect(Object.values(div.style)).toEqual(['3px']);
      expect(classOf(code, { n: 3, on: false }).split(' ')).not.toContain(RED);
    });
  });

  describe('transform: styles that set the same property', () => {
    const BLUE = `const t = css.create({ c: { color: 'blue' }, x: { color: 'blue' }, y: { color: 'green' } });\n`;

    it('keeps the later of two styles that are always applied', async () => {
      const { code, css } = await app(
        BLUE + `export const A = () => <div sx={[s.a, t.c]} />;`,
      );
      expect(classOf(code)).toBe(BLUE_CLASS);
      expect(css).toContain(`.${BLUE_CLASS} { color: blue; }`);
    });

    it('writes a conditional between two of them as it stands', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ on }: any) => <div sx={[on ? s.a : t.c, s.b]} />;`,
      );
      expect(classOf(code, { on: true })).toBe([PADDING, RED].sort().join(' '));
      expect(classOf(code, { on: false })).toBe(
        [PADDING, BLUE_CLASS].sort().join(' '),
      );
    });

    it('looks a bracket and a condition up together', async () => {
      const { code } = await app(
        BLUE +
          `export const A = ({ k, on }: any) => <div sx={[t[k], on && s.a]} />;`,
      );
      expect(classOf(code, { k: 'c', on: true })).toBe(RED);
      expect(classOf(code, { k: 'y', on: false })).toBe(GREEN_CLASS);
      expect(classOf(code, { k: 'x', on: false })).toBe(BLUE_CLASS);
    });
  });
});
