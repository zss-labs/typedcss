import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CSS_FILENAME, unpluginFactory } from '../src/core';

// Each edit recompiles the whole stylesheet, so it must describe the current
// source only: nothing from the theme the edit replaced may remain.

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const devSession = () => {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-theme-')),
  );
  dirs.push(dir);
  const file = path.join(dir, 'box.tsx');
  const plugin = unpluginFactory({ lint: false }, {
    framework: 'vite',
  } as never) as any;
  plugin.__typedcssInternal.setRoot(dir);

  return async (source: string): Promise<string> => {
    fs.writeFileSync(file, source);
    await plugin.transform.handler.call({ addWatchFile() {} }, source, file);
    return plugin.__typedcssInternal.cssLookup.get(
      path.join(dir, CSS_FILENAME),
    );
  };
};

type ThemeArgs = {
  selector?: string;
  key?: string;
  default?: string;
  theme?: string;
};

const moduleWith = (args: ThemeArgs = {}): string => {
  const {
    selector = '.dark',
    key = 'textColor',
    default: def = 'black',
    theme = 'white',
  } = args;
  return `import * as css from '@typedcss/css';
const theme = css.createTheme('${selector}', {
  ${key}: { default: '${def}', theme: '${theme}' },
});
const styles = css.create({ box: { color: theme.${key} } });
export const Box = () => <div sx={styles.box} />;
`;
};

const VAR = /--x[0-9a-z]{7}-[a-z-]+/g;

const varsIn = (css: string): string[] => [...new Set(css.match(VAR) ?? [])];

const referencedIn = (css: string): string[] => [
  ...new Set(
    (css.match(/var\(--x[0-9a-z]{7}-[a-z-]+/g) ?? []).map((ref) =>
      ref.slice(4),
    ),
  ),
];

const expectNoDanglingReference = (css: string): void => {
  for (const name of referencedIn(css)) {
    expect(css).toMatch(new RegExp(`${name}\\s*:`));
  }
};

describe('createTheme edits in dev', () => {
  it('replaces the selector with the new one', async () => {
    const compile = devSession();

    const first = await compile(moduleWith({ selector: '.dark' }));
    const second = await compile(moduleWith({ selector: '.night' }));

    expect(first).toContain('.dark {');
    expect(second).toContain('.night {');
    expect(second).not.toContain('.dark');
    expect(varsIn(second)).toHaveLength(1);
    expectNoDanglingReference(second);
  });

  it('moves between a class selector and an at-rule', async () => {
    const compile = devSession();
    const media = '@media (prefers-color-scheme: dark)';

    await compile(moduleWith({ selector: '.dark' }));
    const toMedia = await compile(moduleWith({ selector: media }));
    expect(toMedia).toContain(media);
    expect(toMedia).not.toContain('.dark');

    const back = await compile(moduleWith({ selector: '.dark' }));
    expect(back).toContain('.dark {');
    expect(back).not.toContain(media);
    expectNoDanglingReference(back);
  });

  it('keeps one variable across repeated selector edits', async () => {
    const compile = devSession();

    await compile(moduleWith({ selector: '.dark' }));
    await compile(moduleWith({ selector: '.night' }));
    await compile(moduleWith({ selector: '[data-theme="dark"]' }));
    const last = await compile(moduleWith({ selector: '.dusk' }));

    expect(varsIn(last)).toHaveLength(1);
    expect(last).toContain('.dusk {');
    expectNoDanglingReference(last);
  });

  it.each([
    ['theme value', { theme: 'ivory' }, 'ivory'],
    ['default value', { default: 'navy' }, 'navy'],
  ])('serves the new %s', async (_, args, value) => {
    const compile = devSession();

    const first = await compile(moduleWith());
    const second = await compile(moduleWith(args));

    expect(second).toContain(value);
    expect(varsIn(second)).toHaveLength(1);
    expect(varsIn(second)).not.toEqual(varsIn(first));
    expectNoDanglingReference(second);
  });

  it('renames the variable when a key is renamed', async () => {
    const compile = devSession();

    expect(await compile(moduleWith({ key: 'textColor' }))).toContain(
      '-text-color',
    );
    const second = await compile(moduleWith({ key: 'fgColor' }));

    expect(second).toContain('-fg-color');
    expect(second).not.toContain('-text-color');
    expectNoDanglingReference(second);
  });

  it('drops a theme the module no longer declares', async () => {
    const compile = devSession();

    await compile(moduleWith());
    const second = await compile(
      `import * as css from '@typedcss/css';
const styles = css.create({ box: { color: 'red' } });
export const Box = () => <div sx={styles.box} />;
`,
    );

    expect(second).toContain('red');
    expect(varsIn(second)).toHaveLength(0);
  });

  it('gives two selectors with one value object a variable each', async () => {
    const compile = devSession();

    const css = await compile(
      `import * as css from '@typedcss/css';
const dark = css.createTheme('.dark', {
  textColor: { default: 'black', theme: 'white' },
});
const sepia = css.createTheme('.sepia', {
  textColor: { default: 'black', theme: 'white' },
});
const styles = css.create({
  a: { color: dark.textColor },
  b: { backgroundColor: sepia.textColor },
});
export const Box = () => <div sx={[styles.a, styles.b]} />;
`,
    );

    expect(varsIn(css)).toHaveLength(2);
    expect(css).toContain('.dark {');
    expect(css).toContain('.sepia {');
    expectNoDanglingReference(css);
  });

  it('leaves a hand-written custom property alone', async () => {
    const compile = devSession();

    const source = (selector: string) => `import * as css from '@typedcss/css';
const theme = css.createTheme('${selector}', {
  textColor: { default: 'black', theme: 'white' },
});
const styles = css.create({
  box: { '--gap': '4px', color: theme.textColor, margin: 'var(--gap)' },
});
export const Box = () => <div sx={styles.box} />;
`;

    await compile(source('.dark'));
    const second = await compile(source('.night'));

    expect(second).toMatch(/--gap:\s*4px/);
    expectNoDanglingReference(second);
  });
});
