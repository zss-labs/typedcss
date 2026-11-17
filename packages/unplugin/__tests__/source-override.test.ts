import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CSS_FILENAME, unpluginFactory } from '../src/core';

const moduleUsing = (color: string) => `import * as css from '@typedcss/css';
const styles = css.create({ box: { color: '${color}' } });
export const Box = () => <div sx={styles.box} />;
`;

const DIR = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-source-')),
);
const FILE = path.join(DIR, 'box.tsx');

afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

it.each([true, false])(
  'serves the CSS collected from disk (dev: %s)',
  async (isDev) => {
    fs.writeFileSync(FILE, moduleUsing('#a11111'));
    const plugin = unpluginFactory({ lint: false }, {
      framework: 'vite',
    } as never) as any;
    plugin.__typedcssInternal.setDev(isDev);
    plugin.__typedcssInternal.setRoot(DIR);

    const result = await plugin.transform.handler.call(
      { addWatchFile() {} },
      moduleUsing('#1111a1'),
      FILE,
    );
    const css: string =
      plugin.__typedcssInternal.cssLookup.get(path.join(DIR, CSS_FILENAME)) ??
      '';
    const [className] = result.code.match(/x[0-9a-z]{7}/) ?? [];

    expect(css).toContain('#a11111');
    expect(css).not.toContain('#1111a1');
    expect(css).not.toContain(`.${className}`);
  },
);

it.each([true, false])(
  'compiles a file whose name holds glob syntax (dev: %s)',
  async (isDev) => {
    const file = path.join(DIR, 'bang!-[slug]-{a}.tsx');
    fs.writeFileSync(file, moduleUsing('#b22224'));
    const plugin = unpluginFactory({ lint: false }, {
      framework: 'vite',
    } as never) as any;
    plugin.__typedcssInternal.setDev(isDev);
    plugin.__typedcssInternal.setRoot(DIR);

    await plugin.transform.handler.call(
      { addWatchFile() {} },
      moduleUsing('#b22224'),
      file,
    );

    expect(
      plugin.__typedcssInternal.cssLookup.get(path.join(DIR, CSS_FILENAME)),
    ).toContain('#b22224');
  },
);

it.each([true, false])(
  'stops on a module that has no file on disk (dev: %s)',
  async (isDev) => {
    const file = path.join(DIR, 'virtual.tsx');
    const plugin = unpluginFactory({ lint: false }, {
      framework: 'vite',
    } as never) as any;
    plugin.__typedcssInternal.setDev(isDev);
    plugin.__typedcssInternal.setRoot(DIR);

    expect(fs.existsSync(file)).toBe(false);
    await expect(
      plugin.transform.handler.call(
        { addWatchFile() {} },
        moduleUsing('#c33333'),
        file,
      ),
    ).rejects.toThrow(/has no file on disk/);
  },
);
