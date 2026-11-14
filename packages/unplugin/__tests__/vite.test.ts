jest.mock('@typedcss/eslint-plugin/guard', () => ({
  lintOverrides: jest.requireActual('@typedcss/eslint-plugin/guard')
    .lintOverrides,
  startLintGuard: jest.fn(),
}));
jest.mock('../src/disk-css', () => ({
  createDiskCssImport: jest.fn((getRoot: () => string) => {
    getRoot();
    return () => '\nimport "./zero-virtual.css";';
  }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import vite from '../src/vite';
import { CSS_FILENAME } from '../src/core';

const { createDiskCssImport: mockCreateDiskCssImport } = jest.requireMock<{
  createDiskCssImport: jest.Mock;
}>('../src/disk-css');

const ROOT = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-vite-')),
);
const EMPTY = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-empty-')),
);
const ID = path.join(ROOT, 'src', 'Card.tsx');
const CHILD = path.join(ROOT, 'src', 'Child.tsx');
const CSS_FILE = path.join(ROOT, CSS_FILENAME);
const CSS_ID = `/${CSS_FILENAME}`;

const card = (color: string) => `import * as css from '@typedcss/css';
const styles = css.create({ box: { color: '${color}' } });
export const Card = () => <div sx={styles.box} />;
`;
const SOURCE = card('teal');

beforeAll(() => {
  fs.mkdirSync(path.dirname(ID), { recursive: true });
  fs.writeFileSync(ID, SOURCE);
  fs.writeFileSync(CHILD, card('navy'));
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(EMPTY, { recursive: true, force: true });
});

afterEach(() => jest.clearAllMocks());

const serve = (options?: Parameters<typeof vite>[0]) => {
  const plugin = vite({ lint: false, ...options })[0] as any;
  plugin.configResolved({ root: ROOT, command: 'serve' });
  return plugin;
};

it('merges Vite config for serve and build commands', () => {
  const plugin = vite()[0] as any;

  expect(
    plugin.config(
      { optimizeDeps: { exclude: ['existing'] } },
      { command: 'serve' },
    ),
  ).toEqual({ optimizeDeps: { exclude: ['existing', '@typedcss/css'] } });
  expect(
    plugin.config({ build: { minify: false } }, { command: 'build' }),
  ).toMatchObject({ build: { minify: false, cssCodeSplit: false } });
});

it('configures source packages and Solid class output', () => {
  const packageRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-vite-package-')),
  );
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ dependencies: { 'ui-kit': '1' } }),
  );
  fs.mkdirSync(path.join(packageRoot, 'node_modules', 'ui-kit', 'src'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(packageRoot, 'node_modules', 'ui-kit', 'package.json'),
    JSON.stringify({
      name: 'ui-kit',
      exports: {
        '.': { typedcss: './src/index.ts', default: './dist/index.js' },
      },
    }),
  );
  const plugin = vite({ lint: false })[0] as any;
  expect(
    plugin.config({ root: packageRoot }, { command: 'serve' }),
  ).toMatchObject({
    optimizeDeps: { exclude: ['@typedcss/css', 'ui-kit'] },
    ssr: { noExternal: ['ui-kit'] },
  });
  plugin.configResolved({
    root: ROOT,
    command: 'serve',
    plugins: [null, { name: 'solid' }],
  });
  fs.rmSync(packageRoot, { recursive: true, force: true });
});

it('starts the lint guard for builds only', () => {
  const { startLintGuard } = jest.requireMock<{ startLintGuard: jest.Mock }>(
    '@typedcss/eslint-plugin/guard',
  );
  (vite()[0] as any).config({}, { command: 'serve' });
  expect(startLintGuard).not.toHaveBeenCalled();
  (vite()[0] as any).config({}, { command: 'build' });
  expect(startLintGuard).toHaveBeenCalledTimes(1);
  (vite({ lint: false })[0] as any).config({}, { command: 'build' });
  expect(startLintGuard).toHaveBeenCalledTimes(1);
});

it('configures RSC builds detected from environments and nested plugins', () => {
  expect(
    (vite()[0] as any).config(
      { environments: { rsc: {} } },
      { command: 'build' },
    ),
  ).toMatchObject({
    environments: { rsc: { build: { cssCodeSplit: false } } },
  });
  expect(
    (vite()[0] as any).config(
      { plugins: [null, 'ignored', [{ name: 'rsc:server' }]] },
      { command: 'build' },
    ),
  ).toMatchObject({
    environments: { rsc: { build: { cssCodeSplit: false } } },
  });
  expect(
    (vite()[0] as any).config(
      { plugins: [{ name: 'rsc' }] },
      { command: 'build' },
    ),
  ).toHaveProperty('environments.rsc.build.cssCodeSplit', false);
});

it('imports the one stylesheet and serves it as a virtual module', async () => {
  const plugin = serve();

  const result = await plugin.transform.handler(SOURCE, ID);

  expect(result.code).toContain(`import "${CSS_ID}";`);
  expect(plugin.resolveId(CSS_ID)).toBe(CSS_FILE);
  expect(plugin.resolveId(`${CSS_FILE}?direct`)).toBe(`${CSS_FILE}?direct`);
  expect(plugin.load(CSS_FILE)).toContain('teal');
  expect(plugin.load(CSS_FILE)).toContain('navy');
  expect(plugin.resolveId('/missing.zero.css')).toBeNull();
  expect(plugin.load('/missing.zero.css')).toBeNull();
});

it('reloads the stylesheet only when its content changes', async () => {
  const reloadModule = jest.fn();
  const plugin = serve();
  plugin.configureServer({
    moduleGraph: { getModuleById: jest.fn(() => ({ id: CSS_FILE })) },
    reloadModule,
  });

  await plugin.transform.handler(SOURCE, ID);
  await plugin.transform.handler(SOURCE, ID);
  expect(reloadModule).toHaveBeenCalledTimes(1);

  await plugin.transform.handler(card('tomato'), ID);
  expect(reloadModule).toHaveBeenCalledTimes(2);
  expect(plugin.load(CSS_FILE)).toContain('tomato');
  expect(plugin.load(CSS_FILE)).not.toContain('teal');
});

it('handles a missing cached stylesheet and missing virtual module', async () => {
  const plugin = serve();
  const set = jest
    .spyOn(plugin.__typedcssInternal.cssLookup, 'set')
    .mockImplementation(function (this: Map<string, string>) {
      return this;
    });
  const reloadModule = jest.fn();
  plugin.configureServer({
    moduleGraph: { getModuleById: jest.fn(() => null) },
    reloadModule,
  });

  await plugin.transform.handler(SOURCE, ID);
  expect(reloadModule).not.toHaveBeenCalled();
  set.mockRestore();
});

it('uses the client environment graph for CSS updates', async () => {
  const cssModule = { id: CSS_FILE };
  const invalidateModule = jest.fn();
  const reloadModule = jest.fn();
  const send = jest.fn();
  const clientGraph = {
    getModulesByFile: jest.fn<Set<typeof cssModule> | undefined, []>(
      () => new Set([cssModule]),
    ),
    getModuleById: jest.fn<typeof cssModule | null, []>(() => cssModule),
    invalidateModule,
  };
  const plugin = serve();
  plugin.configureServer({
    environments: {
      client: { moduleGraph: clientGraph, hot: { send }, reloadModule },
    },
    moduleGraph: { getModuleById: jest.fn(() => null) },
  });
  const rsc = { environment: { name: 'rsc' } };
  const client = { environment: { name: 'client' } };

  await plugin.transform.handler.call(rsc, SOURCE, ID);
  await plugin.transform.handler.call(rsc, SOURCE, ID);
  expect(invalidateModule).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'update',
      updates: [expect.objectContaining({ path: CSS_ID })],
    }),
  );

  await plugin.transform.handler.call(client, SOURCE, ID);
  await plugin.transform.handler.call(client, SOURCE, ID);
  expect(reloadModule).toHaveBeenCalledTimes(1);

  clientGraph.getModulesByFile.mockReturnValue(undefined);
  clientGraph.getModuleById.mockReturnValue(null);
  await plugin.transform.handler.call(rsc, card('plum'), ID);
  expect(send).toHaveBeenCalledTimes(1);
});

it('imports the shared disk file when development CSS is emitted to disk', async () => {
  const plugin = serve({ devEmitToDisk: true });

  const result = await plugin.transform.handler(SOURCE, ID);

  expect(result.code).toContain('import "./zero-virtual.css";');
  expect(result.code).not.toContain(CSS_ID);
  expect(mockCreateDiskCssImport).toHaveBeenCalled();
});

it('omits CSS imports and emits one stylesheet for an RSC build', async () => {
  const plugin = vite({ lint: false })[0] as any;
  plugin.config({ environments: { rsc: {} } }, { command: 'build' });
  plugin.configResolved({ root: ROOT, command: 'build' });

  const result = await plugin.transform.handler(SOURCE, ID);
  expect(result.code).not.toContain(CSS_FILENAME);

  const emitFile = jest.fn(() => 'sheet-ref');
  await plugin.buildEnd.call({ environment: { name: 'client' }, emitFile });
  expect(emitFile).not.toHaveBeenCalled();
  await plugin.buildEnd.call({ environment: { name: 'rsc' }, emitFile });
  expect(emitFile).toHaveBeenCalledWith({
    type: 'asset',
    name: 'typedcss.css',
    source: expect.stringContaining('teal'),
  });

  const importedCss = { add: jest.fn() };
  const chunk = { viteMetadata: { importedCss } };
  expect(
    plugin.renderChunk.call({ environment: { name: 'client' } }, '', chunk),
  ).toBeNull();
  plugin.renderChunk.call(
    { environment: { name: 'rsc' }, getFileName: () => 'typedcss.css' },
    '',
    chunk,
  );
  expect(importedCss.add).toHaveBeenCalledWith('typedcss.css');

  plugin.buildStart();
  expect(
    plugin.renderChunk.call({ environment: { name: 'rsc' } }, '', chunk),
  ).toBeNull();
});

it('does not emit an empty RSC stylesheet or run build hooks outside RSC', async () => {
  const emitFile = jest.fn();
  await (vite()[0] as any).buildEnd.call({
    environment: { name: 'rsc' },
    emitFile,
  });
  expect(emitFile).not.toHaveBeenCalled();

  const rscPlugin = vite({ lint: false })[0] as any;
  rscPlugin.config({ plugins: [{ name: 'rsc' }] }, { command: 'build' });
  rscPlugin.configResolved({ root: EMPTY, command: 'build' });
  await rscPlugin.buildEnd.call({ environment: { name: 'rsc' }, emitFile });
  expect(emitFile).not.toHaveBeenCalled();
});

it('links the single CSS bundle to entry chunks in a non-RSC build', () => {
  const [plugin, cssBundlePlugin] = vite({ lint: false }) as any[];
  const bundle = () => ({
    'assets/style-x.css': {
      type: 'asset',
      fileName: 'assets/style-x.css',
      originalFileNames: ['style.css'],
    },
    'entry.js': {
      type: 'chunk',
      isEntry: true,
      viteMetadata: { importedCss: new Set<string>() },
    },
    'lazy.js': {
      type: 'chunk',
      isEntry: false,
      viteMetadata: { importedCss: new Set<string>() },
    },
  });
  expect(cssBundlePlugin.enforce).toBe('post');

  const serve = bundle();
  plugin.config({}, { command: 'serve' });
  cssBundlePlugin.generateBundle({}, serve);
  expect([...serve['entry.js'].viteMetadata.importedCss]).toEqual([]);

  const build = bundle();
  plugin.config({}, { command: 'build' });
  cssBundlePlugin.generateBundle({}, build);
  expect([...build['entry.js'].viteMetadata.importedCss]).toEqual([
    'assets/style-x.css',
  ]);
  expect([...build['lazy.js'].viteMetadata.importedCss]).toEqual([]);

  const rsc = bundle();
  plugin.config({ plugins: [{ name: 'rsc' }] }, { command: 'build' });
  cssBundlePlugin.generateBundle({}, rsc);
  expect([...rsc['entry.js'].viteMetadata.importedCss]).toEqual([]);
});

it('re-transforms every other target when a file with styles changes', async () => {
  const plugin = serve();
  const dependent = { id: CHILD };
  const original = { id: ID };

  expect(plugin.handleHotUpdate({ modules: [], file: ID })).toBeUndefined();

  plugin.configureServer({
    moduleGraph: { getModuleById: jest.fn((id: string) => ({ id })) },
    reloadModule: jest.fn(),
  });
  await plugin.transform.handler(SOURCE, ID);
  await plugin.transform.handler(card('navy'), CHILD);

  expect(plugin.handleHotUpdate({ modules: [original], file: ID })).toEqual([
    original,
    dependent,
  ]);
  plugin.configureServer({
    moduleGraph: { getModuleById: jest.fn(() => null) },
    reloadModule: jest.fn(),
  });
  expect(plugin.handleHotUpdate({ modules: [original], file: ID })).toEqual([
    original,
  ]);
  expect(
    plugin.handleHotUpdate({
      modules: [original],
      file: path.join(ROOT, 'notes.md'),
    }),
  ).toEqual([original]);
  expect(
    plugin.handleHotUpdate({
      modules: [original],
      file: path.join(ROOT, 'other.ts'),
    }),
  ).toEqual([original]);
  expect(
    plugin.handleHotUpdate({
      modules: [original],
      file: path.join(ROOT, 'node_modules', 'pkg', 'index.ts'),
    }),
  ).toEqual([original]);
});
