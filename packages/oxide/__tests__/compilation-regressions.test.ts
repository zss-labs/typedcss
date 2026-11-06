import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSync } from '@swc/core';
import {
  getStyleRecords,
  DEFAULT_STYLE_PROP,
  evaluateModule,
  renderClass,
} from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const env = (source: string, filePath: string) => ({
    source,
    moduleId: filePath,
    filePath,
    root: directory,
    cwd: directory,
    styleProp: DEFAULT_STYLE_PROP,
    propertyPolicy: undefined,
    isDev: false,
    addDependency: () => {},
  });

  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-regressions-')),
  );
  const prefix = `import * as css from '@typedcss/css';`;
  const styles = `const styles = css.create({ a: { color: 'red' }, b: { padding: 4 }, c: { color: 'blue' } });`;
  const run = async (
    source: string,
    resourcePath = path.join(directory, 'fixture.tsx'),
  ): Promise<string> => {
    const result = await transformSource(env(source, resourcePath));
    return result.code;
  };
  const checkSyntax = (source: string) =>
    parseSync(source, { syntax: 'typescript', tsx: true });
  const classHash = (style: Record<string, any>) =>
    getStyleRecords(style)[0].hash;
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
  afterEach(() => {
    for (const name of fs.readdirSync(directory))
      fs.rmSync(path.join(directory, name));
  });

  it('preserves UTF-8 BOM and multibyte leading comments without shifting replacements', async () => {
    const result = await run(
      '\uFEFF/* 日本語 */\n' +
        prefix +
        styles +
        'export const el = <div sx={styles.a} />;',
    );
    expect(result).toContain('/* 日本語 */');
    expect(renderClass(result, {}, 'el')).toBe(classHash({ color: 'red' }));
    expect(() => checkSyntax(result)).not.toThrow();
  });

  // Not a typedcss requirement: typedcss rejects sx beside className or style on the same element: css.props sets both itself, so they are written as styles in sx.
  it.skip.each([
    `<div style={{ color: theme.primary }} className={staticValues.name} sx={styles.a} />`,
    `<div sx={styles.a} style={{ color: theme.primary }} className={staticValues.name} />`,
  ])('rewrites constants inside preserved JSX attributes: %s', async (jsx) => {
    const result = await run(
      prefix +
        styles +
        `const theme = css.createTheme(':root', { primary: 'green' }); const staticValues = css.createStatic({ name: 'existing' }); export const el = ${jsx};`,
    );
    expect(result).not.toContain('theme.primary');
    expect(result).not.toContain('staticValues.name');
    expect(result).toContain('var(--');
    expect(result).toContain('existing');
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it('retains ordered styles in conditional array branches', async () => {
    const result = await run(
      prefix +
        styles +
        `export const el = <div sx={flag ? [styles.a, styles.b] : styles.c} />;`,
    );
    expect(result).toContain(classHash({ color: 'red' }));
    expect(result).toContain(classHash({ padding: 4 }));
    expect(result).toContain(classHash({ color: 'blue' }));
    expect(() => checkSyntax(result)).not.toThrow();
  });

  // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
  it.skip.each(['flag || styles.b', 'flag ?? styles.b', "''", '0'])(
    'reports unsupported style entries instead of dropping styles: %s',
    async (entry) => {
      await expect(
        run(
          prefix +
            styles +
            `export const el = <div sx={[styles.a, ${entry}]} />;`,
        ),
      ).rejects.toThrow('unresolvable style object');
    },
  );

  // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
  it.skip('rejects an unresolved conditional branch instead of emitting only its other branch', async () => {
    await expect(
      run(
        prefix +
          styles +
          `export const el = <div sx={flag ? [styles.a, unknownStyle] : styles.c} />;`,
      ),
    ).rejects.toThrow('unresolvable style object');
  });

  // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
  it.skip.each(['styles.a', 'styles[key]', '[styles.a]'])(
    'does not resolve a shadowed styling-prop binding: %s',
    async (expression) => {
      await expect(
        run(
          prefix +
            styles +
            `export function Component(styles: any) { return <div sx={${expression}} />; }`,
        ),
      ).rejects.toThrow('unresolvable style object');
    },
  );

  it('reports nested style definitions before overwriting the module binding', async () => {
    await expect(
      run(
        prefix +
          styles +
          `export function Component() { const styles = css.create({a:{color:'green'}}); return <div sx={styles.a} />; }`,
      ),
    ).rejects.toThrow('top-level variable');
  });

  it('applies a style received through an object-rest component parameter', async () => {
    const child = path.join(directory, 'Child.tsx');
    const parent = path.join(directory, 'Parent.tsx');
    const childSource =
      prefix +
      `export const Child = ({ id, ...rest }: any) => <div id={id} sx={rest.styleArray} />;`;
    const parentSource =
      prefix +
      styles +
      `import { Child } from './Child'; export const Parent = () => <Child id="child" styleArray={styles.a} />;`;
    fs.writeFileSync(child, childSource);
    fs.writeFileSync(parent, parentSource);
    const result = await run(childSource, child);
    const parentResult = await run(parentSource, parent);
    // typedcss hands the style over at runtime, so the parent is rendered.
    const load = (name: string) =>
      name === './Child' ? evaluateModule(result) : undefined;
    expect(renderClass(parentResult, {}, 'Parent', load)).toBe(
      classHash({ color: 'red' }),
    );
    expect(result).toContain('rest.styleArray');
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it.each(['flag && styles.c', 'flag ? styles.c : styles.b'])(
    'compiles conditional entries of a style array passed to a component: %s',
    async (conditional) => {
      const child = path.join(directory, `ArrayChild${conditional.length}.tsx`);
      const parent = path.join(
        directory,
        `ArrayParent${conditional.length}.tsx`,
      );
      const childSource =
        prefix +
        `export const Child = ({ styleArray }: any) => <div sx={styleArray} />;`;
      const parentSource =
        prefix +
        styles +
        `import { Child } from './${path.basename(child, '.tsx')}'; export const Parent = ({flag}: any) => <Child styleArray={[styles.a, ${conditional}]} />;`;
      fs.writeFileSync(child, childSource);
      fs.writeFileSync(parent, parentSource);
      const parentResult = await run(parentSource, parent);
      const childResult = await run(childSource, child);
      // typedcss hands the array over at runtime, so the parent is rendered.
      const load = (name: string) =>
        name === `./${path.basename(child, '.tsx')}`
          ? evaluateModule(childResult)
          : undefined;
      const on = renderClass(
        parentResult,
        { flag: true },
        'Parent',
        load,
      ).split(' ');
      expect(on).toContain(classHash({ color: 'blue' }));
      expect(on).not.toContain(classHash({ color: 'red' }));
      expect(() => checkSyntax(parentResult)).not.toThrow();
      expect(() => checkSyntax(childResult)).not.toThrow();
    },
  );

  it.each([
    '({ a: { color: "red" } } as const)',
    '({ a: { color: "red" } } satisfies Record<string, any>)',
    'rules',
  ])('accepts statically readable style arguments: %s', async (argument) => {
    const result = await run(
      prefix +
        `const rules = { a: { color: 'red' } }; const styles = css.create(${argument}); export const el = <div sx={styles.a} />;`,
    );
    expect(result).toContain(classHash({ color: 'red' }));
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it.each([
    'export default css.create({a: {color: "red"}});',
    'let styles; styles = css.create({a: {color: "red"}});',
    'const {a} = css.create({a: {color: "red"}});',
  ])(
    'diagnoses unsupported declarations without emitting broken code: %s',
    async (declaration) => {
      await expect(run(prefix + declaration)).rejects.toThrow(
        'top-level variable',
      );
    },
  );

  it.each([
    '(styles as any).a',
    'styles!.a',
    'styles.a!',
    'styles?.a',
    '(styles.a)',
  ])(
    'resolves styles through a transparent expression wrapper: %s',
    async (expression) => {
      const result = await run(
        prefix + styles + `export const el = <div sx={${expression}} />;`,
      );
      expect(result).toContain(classHash({ color: 'red' }));
      expect(() => checkSyntax(result)).not.toThrow();
    },
  );

  it('retains other declarators in the same declaration', async () => {
    const result = await run(
      prefix +
        `const box = css.create({ a: { color: 'red' } }), keep = 42;` +
        `export const el = <div sx={box.a}>{keep}</div>;`,
    );
    expect(result).toContain('keep = 42');
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it('retains a separately exported style binding', async () => {
    const result = await run(prefix + styles + `export { styles };`);
    expect(result).toMatch(/const styles\s*=/);
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it('does not replace a shadowed binding outside JSX', async () => {
    const result = await run(
      prefix +
        styles +
        `export function read(styles: { a: string }) { return styles.a; }`,
    );
    expect(result).toContain('return styles.a');
    expect(() => checkSyntax(result)).not.toThrow();
  });

  it('compiles a style array that contains a hole', async () => {
    const result = await run(
      prefix + styles + `export const el = <div sx={[, styles.a]} />;`,
    );
    expect(result).toContain(classHash({ color: 'red' }));
    expect(() => checkSyntax(result)).not.toThrow();
  });

  // Not a typedcss requirement: typedcss rejects sx beside className or style on the same element: css.props sets both itself, so they are written as styles in sx.
  it.skip.each([
    ["{ color: 'red', }", "color: 'red'"],
    ["{ color: 'red' // note\n}", "color: 'red'"],
    ["{ color: 'red', // note\n}", "color: 'red'"],
    ['{ ...rest, }', '...rest'],
  ])(
    'extends a preserved inline style object written as %s',
    async (styleObject, preserved) => {
      const result = await run(
        prefix +
          styles +
          `const tone = css.create({ box: (color: string) => ({ background: color }) });` +
          `export const el = <div style={${styleObject}} sx={tone.box('blue')} />;`,
      );
      expect(result).toContain(preserved);
      expect(result).toContain('"blue"');
      expect(() => checkSyntax(result)).not.toThrow();
    },
  );
});
