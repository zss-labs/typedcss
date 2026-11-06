// A dependency that exports typedcss source through the `typedcss` condition
// is resolved to that source and compiled like an app file, while the rest of
// node_modules stays untouched.
jest.mock('@typedcss/eslint-plugin/guard', () => ({
  lintOverrides: jest.requireActual('@typedcss/eslint-plugin/guard')
    .lintOverrides,
  startLintGuard: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unpluginFactory } from '../src/core';
import { attachWebpackHooks } from '../src/webpack';

const ROOT = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-package-')),
);
const PKG = path.join(ROOT, 'node_modules', 'ui-kit');
const BUTTON = path.join(PKG, 'src', 'Button.tsx');
const BUTTON_SOURCE = `import * as css from '@typedcss/css';
const styles = css.create({ base: { color: 'rgb(1, 2, 3)' } });
export const Button = () => <button sx={styles.base} />;
`;

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeAll(() => {
  write(
    path.join(ROOT, 'package.json'),
    JSON.stringify({ dependencies: { 'ui-kit': '1.0.0', plain: '1.0.0' } }),
  );
  write(
    path.join(ROOT, 'App.tsx'),
    `import { Button } from 'ui-kit';\nexport const App = () => <Button />;\n`,
  );
  write(
    path.join(PKG, 'package.json'),
    JSON.stringify({
      name: 'ui-kit',
      exports: {
        '.': { typedcss: './src/index.ts', default: './dist/index.js' },
        './*': { typedcss: './src/*.tsx', default: './dist/*.js' },
      },
    }),
  );
  write(
    path.join(PKG, 'src', 'index.ts'),
    `export { Button } from './Button';\n`,
  );
  write(BUTTON, BUTTON_SOURCE);
  write(path.join(PKG, 'dist', 'a.js'), BUTTON_SOURCE);
  write(
    path.join(ROOT, 'node_modules', 'plain', 'package.json'),
    JSON.stringify({ name: 'plain', exports: './index.js' }),
  );
  write(path.join(ROOT, 'node_modules', 'plain', 'index.js'), BUTTON_SOURCE);
});

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const createPlugin = () => {
  const plugin = unpluginFactory({ lint: false }, {
    framework: 'vite',
  } as never) as any;
  plugin.__typedcssInternal.setRoot(ROOT);
  return plugin;
};

it('resolves the package and its wildcard subpaths to source', () => {
  const plugin = createPlugin();

  expect(plugin.resolveId('ui-kit')).toBe(path.join(PKG, 'src', 'index.ts'));
  expect(plugin.resolveId('ui-kit/Button')).toBe(BUTTON);
  expect(plugin.resolveId('plain')).toBeNull();
  expect(plugin.resolveId('ui-kitx')).toBeNull();
  expect(plugin.__typedcssInternal.resolveSource('ui-kit')).toBe(
    path.join(PKG, 'src', 'index.ts'),
  );
});

it('compiles files under the exported source directory only', async () => {
  const plugin = createPlugin();

  const result = await plugin.transform.handler.call({}, BUTTON_SOURCE, BUTTON);
  expect(result?.code).not.toContain('css.create(');
  expect(plugin.__typedcssInternal.inSource(BUTTON)).toBe(true);

  await expect(
    plugin.transform.handler.call(
      {},
      BUTTON_SOURCE,
      path.join(PKG, 'dist', 'a.js'),
    ),
  ).resolves.toBeNull();
  await expect(
    plugin.transform.handler.call(
      {},
      BUTTON_SOURCE,
      path.join(ROOT, 'node_modules', 'plain', 'index.js'),
    ),
  ).resolves.toBeNull();
});

it('collects package styles an app file only renders', () => {
  const plugin = createPlugin();

  expect(plugin.__typedcssInternal.refresh()).toContain('rgb(1, 2, 3)');
  expect(plugin.__typedcssInternal.stylesheetFiles.has(BUTTON)).toBe(true);
});

it('rereads the packages when the root changes', () => {
  const plugin = createPlugin();
  expect(plugin.resolveId('ui-kit')).not.toBeNull();

  plugin.__typedcssInternal.setRoot(path.join(ROOT, 'node_modules'));
  expect(plugin.resolveId('ui-kit')).toBeNull();
});

it('lets the webpack adapter include and resolve package source', () => {
  const plugin = createPlugin();
  attachWebpackHooks(plugin);

  expect(plugin.transformInclude(BUTTON)).toBe(true);
  expect(plugin.transformInclude(path.join(PKG, 'dist', 'a.js'))).toBe(false);
  expect(plugin.resolveId('ui-kit/Button')).toBe(BUTTON);
});
