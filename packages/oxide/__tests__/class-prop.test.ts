import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP, renderProps } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-class-prop-')),
  );

  const prefix = `import * as css from '@typedcss/css';`;
  const styles = `const styles = css.create({ a: { color: 'red' }, dyn: (x: number = 0) => ({ width: x }) });`;

  const run = async (body: string, classProp?: string) => {
    const filePath = path.join(directory, `${Math.random()}.tsx`);
    const source = `${prefix}\n${styles}\n${body}\n`;
    fs.writeFileSync(filePath, source);
    const { code } = await transformSource({
      source,
      moduleId: filePath,
      filePath,
      root: directory,
      cwd: directory,
      styleProp: DEFAULT_STYLE_PROP,
      classProp,
      propertyPolicy: undefined,
      isDev: false,
      addDependency: () => {},
    });
    return code;
  };

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('writes className when no class prop is configured', async () => {
    const code = await run(`export const A = () => <div sx={styles.a} />;`);

    // typedcss sets the attribute at runtime, so the element is rendered.
    const props = renderProps(code);
    expect(props.className).toBe('xq96bg3w');
    expect(props).not.toHaveProperty('class');
  });

  it('writes the configured attribute instead of className', async () => {
    const code = await run(
      `export const A = () => <div sx={styles.a} />;`,
      'class',
    );

    const props = renderProps(code);
    expect(props.class).toBe('xq96bg3w');
    expect(props).not.toHaveProperty('className');
  });

  it('keeps the style attribute for a dynamic function key', async () => {
    const code = await run(
      `export const A = () => <div sx={[styles.a, styles.dyn(1)]} />;`,
      'class',
    );

    const props = renderProps(code);
    expect(props.class).toMatch(/xq96bg3w/);
    expect(Object.values(props.style)).toEqual(['1px']);
    expect(props).not.toHaveProperty('className');
  });

  // Not a typedcss requirement: typedcss rejects sx beside className on the same element: css.props sets className itself, so extra classes are written as styles in sx.
  it.skip('merges an existing attribute written under the configured name', async () => {
    const code = await run(
      `export const A = () => <div class="kept" sx={styles.a} />;`,
      'class',
    );

    expect(code).toContain('class={');
    expect(code).toContain('kept');
    expect(code).not.toContain('className={');
  });
});
