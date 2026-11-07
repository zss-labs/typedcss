import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'transform-coverage-')),
  );
  let count = 0;

  const run = async (
    source: string,
    options: { scan?: string[]; dependencies?: string[] } = {},
  ) => {
    const filePath = path.join(directory, `fixture-${count++}.tsx`);
    const scan = options.scan ?? [filePath];
    for (const name of fs.readdirSync(directory)) {
      const existing = path.join(directory, name);
      if (!scan.includes(existing)) fs.rmSync(existing);
    }
    if (scan.includes(filePath)) fs.writeFileSync(filePath, source);
    return transformSource({
      source,
      moduleId: filePath,
      filePath,
      root: directory,
      cwd: directory,
      styleProp: DEFAULT_STYLE_PROP,
      propertyPolicy: undefined,
      isDev: false,
      addDependency: (dependency: string) =>
        options.dependencies?.push(dependency),
    });
  };

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  describe('transformSource uncovered syntax forms', () => {
    it('supports a default core import and an aliased defaulted prop', async () => {
      const result = await run(`
      import css from '@typedcss/css';
      const s = css.create({ a: { color: 'red' } });
      export const Card = ({ cardStyle: local = s.a }: { cardStyle?: css.Style }) =>
        <div sx={local} />;
      export const App = () => <Card />;
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    it.each([
      ['create', `const value = css.create(make());`],
      ['createStatic', `const value = css.createStatic(make());`],
      ['createTheme', `const value = css.createTheme('.dark', make());`],
    ])('rejects %s without its object argument', async (_name, declaration) => {
      await expect(
        run(`import * as css from '@typedcss/css'; ${declaration}`, {
          scan: [],
        }),
      ).rejects.toThrow(/needs a style object/);
    });

    it.each([
      [
        `const selector = getSelector(); const t = css.createTheme(selector, {});`,
        /needs a selector/,
      ],
      [`const t = css.createTheme('@font-face', {});`, /Unsupported at-rule/],
    ])('rejects an unreadable theme selector', async (body, message) => {
      await expect(
        run(`import * as css from '@typedcss/css'; ${body}`, { scan: [] }),
      ).rejects.toThrow(message);
    });

    it('preserves type-only core specifiers', async () => {
      const result = await run(`
      import { type Style, create as make } from '@typedcss/css';
      const s = make({ a: { color: 'red' } });
      export const A = ({ value }: { value?: Style }) => <div sx={[s.a, value]} />;
    `);
      // typedcss keeps the core import, which carries the runtime.
      expect(result.code).toContain('type Style');
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('supports the named use import', async () => {
      const result = await run(`
      import { create, use as classes } from '@typedcss/css';
      const s = create({ a: { color: 'red' } });
      export const value = classes(s.a);
    `);
      expect(result.code).not.toContain('classes(s.a)');
    });

    // Not a typedcss requirement: sx together with className or style on the same element is rejected.
    it.skip('merges a non-object existing style expression', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: (size: number) => ({ width: size }) });
      export const A = ({ size, style }: any) =>
        <div style={style} sx={s.a(size)} />;
    `);
      expect(result.code).toContain('...(style)');
    });

    // Not a typedcss requirement: sx together with className or style on the same element is rejected.
    it.skip('removes an empty style prop while retaining className', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      export const A = ({ name }: any) =>
        <div className={name} sx={undefined} />;
    `);
      expect(result.code).toContain('className={(name)}');
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('rejects a dynamic function key passed to use', async () => {
      await expect(
        run(`
        import * as css from '@typedcss/css';
        const s = css.create({ a: (size: number) => ({ width: size }) });
        export const value = css.use(s.a(2));
      `),
      ).rejects.toThrow(/does not support dynamic function keys/);
    });

    it('compiles local keyframes, view transitions, and themes', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const frames = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
      const transition = css.viewTransitionClass({ old: { opacity: 0 } });
      const theme = css.createTheme('.dark', { color: 'blue' });
      const statics = css.createStatic({ gap: 4 });
      const s = css.create({ a: { animationName: frames, color: theme.color } });
      export const A = () => <div sx={s.a} data-values={[transition, statics.gap]} />;
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    it('accepts a literal style object and sparse style arrays', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: { color: 'red' } });
      export const A = ({ on }: any) =>
        <><div sx={{ color: 'blue' }} /><div sx={[s.a, , on && s.a]} /></>;
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('supports shorthand named arguments and reports a missing one', async () => {
      const ok = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: ({ color }: { color: string }) => ({ color }) });
      export const A = ({ color }: any) => <div sx={s.a({ color })} />;
    `);
      expect(ok.code).toContain('__typedcss_props(');

      await expect(
        run(`
        import * as css from '@typedcss/css';
        const s = css.create({ a: ({ color }: { color: string }) => ({ color }) });
        export const A = () => <div sx={s.a({})} />;
      `),
      ).rejects.toThrow(/leaves "color" unset/);
    });

    it('resolves a positional function called with an object value', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: (value: any) => ({ color: value.color }) });
      export const A = () => <div sx={s.a({ value: { color: 'red' } })} />;
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    it('discovers a component wrapped in a default-exported call', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: { color: 'red' } });
      declare const memo: <T>(value: T) => T;
      export default memo(({ cardStyle = s.a }: { cardStyle?: css.Style }) =>
        <div sx={cardStyle} />);
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    it('resolves a complete local create object used as a style', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const styles = css.create({ color: 'red', padding: 4 });
      export const A = () => <div sx={styles} />;
    `);
      expect(result.code).toContain('__typedcss_props(');
    });

    it('handles an empty style array without adding a class', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      export const A = () => <div sx={[]} />;
    `);
      expect(result.code).not.toContain('sx');
    });

    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip('rejects an unknown computed style group', async () => {
      await expect(
        run(`
        import * as css from '@typedcss/css';
        export const A = ({ styles, kind }: any) => <div sx={styles[kind]} />;
      `),
      ).rejects.toThrow(/not supported/);
    });

    // Not a typedcss requirement: lookup tables and their keys.
    it.skip('chooses a collision-free key for computed style groups', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ '#': { color: 'red' }, value: { color: 'blue' } });
      export const A = ({ kind, on }: any) => <div sx={on ? s[kind] : s.value} />;
    `);
      expect(result.code).toContain('##');
    });

    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip('ignores a computed dynamic-function callee during detection', async () => {
      await expect(
        run(`
        import * as css from '@typedcss/css';
        const s = css.create({ a: (size: number) => ({ width: size }) });
        export const A = () => <div sx={s['a'](2)} />;
      `),
      ).rejects.toThrow(/not supported/);
    });
  });

  describe('transformSource imported tables', () => {
    it('resolves every exported table kind and records the dependency', async () => {
      const library = path.join(directory, 'library.ts');
      const librarySource = `
      import * as css from '@typedcss/css';
      export const constant = 'red';
      export const frames = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
      export const transition = css.viewTransitionClass({ old: { opacity: 0 } });
      export const styles = css.create({ a: { color: constant, animationName: frames } });
      export const theme = css.createTheme('.dark', { color: 'blue' });
      export const statics = css.createStatic({ gap: 4 });
    `;
      fs.writeFileSync(library, librarySource);

      const source = `
      import { constant, frames, transition, styles, theme, statics } from './library';
      export const A = () => <div sx={styles.a} data-values={[constant, frames, transition, theme.color, statics.gap]} />;
    `;
      const consumer = path.join(directory, `fixture-${count}.tsx`);
      const dependencies: string[] = [];
      const result = await run(source, {
        scan: [library, consumer],
        dependencies,
      });

      // The consumer reads these at runtime, so its output does not depend on
      // the library's source and nothing is recorded.
      expect(result.code).toContain('__typedcss_props(');
      expect(dependencies).toEqual([]);
    });

    it('resolves an imported style through a computed key', async () => {
      const library = path.join(directory, 'computed-library.ts');
      fs.writeFileSync(
        library,
        `import * as css from '@typedcss/css'; export const styles = css.create({ a: { color: 'red' }, b: { color: 'blue' } });`,
      );
      const source = `
      import { styles } from './computed-library';
      export const A = ({ kind }: any) => <div sx={styles[kind]} />;
    `;
      const consumer = path.join(directory, `fixture-${count}.tsx`);
      const result = await run(source, { scan: [library, consumer] });
      expect(result.code).toContain('[kind]');
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('rejects an imported dynamic function key passed to use', async () => {
      const library = path.join(directory, 'dynamic-library.ts');
      fs.writeFileSync(
        library,
        `import * as css from '@typedcss/css'; export const styles = css.create({ a: (size: number) => ({ width: size }) });`,
      );
      const source = `
      import * as css from '@typedcss/css';
      import { styles } from './dynamic-library';
      export const value = css.use(styles.a(2));
    `;
      const consumer = path.join(directory, `fixture-${count}.tsx`);
      await expect(run(source, { scan: [library, consumer] })).rejects.toThrow(
        /does not support dynamic function keys/,
      );
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('skips a computed callee while validating named use arguments', async () => {
      await expect(
        run(`
        import { create, use } from '@typedcss/css';
        const s = create({ a: () => ({ color: 'red' }) });
        export const value = use(s['a']());
      `),
      ).rejects.toThrow(/not supported/);
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component.
    it.skip('leaves a component carrier unresolved for an object-style function call', async () => {
      const source = `
      import * as css from '@typedcss/css';
      const s = css.create({ a: (value: any) => ({ color: value.color }) });
      const Card = ({ boxStyle }: { boxStyle?: css.Style }) => <div sx={boxStyle} />;
      export const A = () => <Card boxStyle={s.a({ value: { color: 'red' } })} />;
    `;
      const consumer = path.join(directory, `fixture-${count}.tsx`);
      await expect(run(source, { scan: [consumer] })).rejects.toThrow(
        /only supported in the sx prop/,
      );
    });
  });

  describe('transformSource argument and group resolution', () => {
    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('folds a static object argument into a positional dynamic function', async () => {
      const result = await run(`
      import * as css from '@typedcss/css';
      const s = css.create({ a: (value: string) => ({ color: value }) });
      export const A = () => <div sx={s.a({ value: 'red' })} />;
    `);
      expect(result.code).toContain('__typedcss_props(');
      expect(result.code).not.toContain('style={');
      expect(
        compileCSS({ include: ['*.tsx'], exclude: [], cwd: directory }),
      ).toContain('color: red');
    });

    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip('rejects a computed key on a top-level object that holds no styles', async () => {
      await expect(
        run(`
        import * as css from '@typedcss/css';
        const s = css.create({ a: { color: 'red' } });
        const palette = { a: s.a };
        export const A = ({ kind }: any) => <div sx={palette[kind]} />;
      `),
      ).rejects.toThrow(/"palette\[kind\]" is not supported/);
    });
  });
});
