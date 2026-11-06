jest.mock('@typedcss/eslint-plugin/guard', () => ({
  lintOverrides: jest.requireActual('@typedcss/eslint-plugin/guard')
    .lintOverrides,
  startLintGuard: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CSS_FILENAME, unpluginFactory } from '../src/core';

const ROOT = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unplugin-core-')),
);
const CARD = path.join(ROOT, 'Card.tsx');
const TOKENS = path.join(ROOT, 'tokens.ts');
const CSS_FILE = path.join(ROOT, CSS_FILENAME);
const CSS_ID = `/${CSS_FILENAME}`;

const card = (
  color: string,
  prop = 'sx',
) => `import * as css from '@typedcss/css';
import { space } from './tokens';
const styles = css.create({ box: { color: '${color}', padding: space.md } });
export const Card = () => <div ${prop}={styles.box} />;
`;
const TOKENS_SOURCE = `import * as css from '@typedcss/css';
export const space = css.createStatic({ md: 12 });
`;

beforeAll(() => {
  fs.writeFileSync(CARD, card('teal'));
  fs.writeFileSync(TOKENS, TOKENS_SOURCE);
});

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const createPlugin = (options: Parameters<typeof unpluginFactory>[0] = {}) => {
  const plugin = unpluginFactory({ lint: false, ...options }, {
    framework: 'rollup',
  } as never) as any;
  plugin.__typedcssInternal.setRoot(ROOT);
  return plugin;
};

it('exposes metadata and applies the include filter', () => {
  const plugin = createPlugin({ include: '**/*.tsx' });

  expect(plugin).toMatchObject({ name: '@typedcss/unplugin', enforce: 'pre' });
  expect(plugin.__typedcssInternal.unpluginMeta).toEqual({
    framework: 'rollup',
  });
  expect(plugin.transformInclude('/project/Card.tsx')).toBe(true);
  expect(plugin.transformInclude('/project/Card.ts')).toBe(false);
});

it('resolves and identifies virtual CSS ids', () => {
  const plugin = createPlugin();

  expect(plugin.resolveId(`${CSS_ID}?direct`)).toBe(`${CSS_ID}?direct`);
  expect(plugin.resolveId(`./${CSS_FILENAME}?direct`, CARD)).toBe(
    `${CSS_FILE}?direct`,
  );
  expect(plugin.resolveId(`./${CSS_FILENAME}`, CARD)).toBe(CSS_FILE);
  expect(plugin.resolveId(CSS_FILENAME)).toBe(CSS_FILENAME);
  expect(plugin.resolveId(`${CSS_FILENAME}?inline`)).toBe(
    `${CSS_FILENAME}?inline`,
  );
  expect(plugin.resolveId(CARD, CARD)).toBeNull();
  expect(plugin.loadInclude(`${CSS_FILE}?t=1`)).toBe(true);
  expect(plugin.loadInclude(CARD)).toBe(false);
});

it('uses the configured class prop', async () => {
  const plugin = createPlugin();
  plugin.__typedcssInternal.setClassProp('class');
  const transformed = await plugin.transform.handler(card('teal'), CARD);
  expect(transformed.code).toContain('classProps as __typedcss_props');
});

it('permits a compiler no-op', async () => {
  jest.resetModules();
  jest.doMock('@typedcss/oxide', () => ({
    ...jest.requireActual('@typedcss/oxide'),
    sourcePackages: () => [],
    needsCompile: () => true,
    transform: () => null,
  }));
  let factory: typeof unpluginFactory;
  jest.isolateModules(() => {
    factory = require('../src/core').unpluginFactory;
  });
  const plugin = factory!({ lint: false }, {} as never) as any;
  await expect(
    plugin.transform.handler('source', '/tmp/file.ts'),
  ).resolves.toBeNull();
  jest.dontMock('@typedcss/oxide');
});

it('skips dependencies, unrelated sources, and excluded files', async () => {
  const plugin = createPlugin({ exclude: '**/excluded.tsx' });

  await expect(
    plugin.transform.handler(
      card('teal'),
      path.join(ROOT, 'node_modules/pkg/index.tsx'),
    ),
  ).resolves.toBeNull();
  await expect(
    plugin.transform.handler('export {};', path.join(ROOT, 'plain.ts')),
  ).resolves.toBeNull();
  await expect(
    plugin.transform.handler(card('teal'), path.join(ROOT, 'excluded.tsx?raw')),
  ).resolves.toBeNull();
  await expect(
    plugin.transform.handler(card('teal'), path.join(ROOT, 'index.html')),
  ).resolves.toBeNull();
});

it('rewrites sx into a merge call and imports the one stylesheet', async () => {
  const plugin = createPlugin();

  const result = await plugin.transform.handler(card('teal'), `${CARD}?raw`);

  expect(result.map).toBeNull();
  expect(result.code).toContain('__typedcss_props(styles.box)');
  expect(result.code).not.toContain('sx=');
  expect(result.code.endsWith(`\nimport "${CSS_ID}";`)).toBe(true);
  expect(plugin.load(`${CSS_ID}?direct`)).toContain('color: teal');
  expect(plugin.load(CSS_FILE)).toContain('padding: 12px');
});

it('reads the styling prop the options name', async () => {
  const plugin = createPlugin({ styleProp: 'css' });

  const result = await plugin.transform.handler(card('teal', 'css'), CARD);

  expect(result.code).toContain('__typedcss_props(styles.box)');
});

it('compiles the stylesheet from the source it was handed, not the disk', async () => {
  const plugin = createPlugin();

  await plugin.transform.handler(card('tomato'), CARD);

  expect(plugin.load(CSS_FILE)).toContain('tomato');
  expect(plugin.load(CSS_FILE)).not.toContain('teal');
});

it('records every file with styles as a dependency of the target', async () => {
  const plugin = createPlugin();

  await plugin.transform.handler(card('teal'), CARD);
  await plugin.transform.handler(card('teal'), CARD);

  expect(plugin.__typedcssInternal.targets).toEqual([
    { id: CARD, dependencies: expect.arrayContaining([CARD, TOKENS]) },
  ]);
  expect([...plugin.__typedcssInternal.stylesheetFiles].sort()).toEqual(
    [CARD, TOKENS].sort(),
  );
});

it('uses a custom CSS import formatter and permits omitting the import', async () => {
  const plugin = createPlugin();
  const formatter = jest.fn(() => null);
  plugin.__typedcssInternal.setCssImport(formatter);

  const omitted = await plugin.transform.handler(card('teal'), CARD);
  expect(omitted.code).not.toContain(CSS_ID);
  expect(formatter).toHaveBeenCalledWith({
    id: CARD,
    cssId: CSS_ID,
    cssFilename: CSS_FILE,
    css: expect.stringContaining('teal'),
  });

  plugin.__typedcssInternal.setCssImport(null);
  const restored = await plugin.transform.handler(card('teal'), CARD);
  expect(restored.code).toContain(`import "${CSS_ID}";`);
});

it('compiles the stylesheet on demand when it is loaded first', () => {
  const plugin = createPlugin();

  expect(plugin.load(CSS_ID)).toContain('teal');
});

it('stops on a property the policy rejects', async () => {
  const plugin = createPlugin({ withoutPhysicalProperties: true });
  const source = `import * as css from '@typedcss/css';
const styles = css.create({ box: { marginLeft: 4 } });
export const Box = () => <div sx={styles.box} />;
`;

  await expect(
    plugin.transform.handler(source, path.join(ROOT, 'Box.tsx')),
  ).rejects.toThrow("'marginLeft' is the physical name of this property");
});

describe('the lint guard', () => {
  const { startLintGuard } = jest.requireMock<{ startLintGuard: jest.Mock }>(
    '@typedcss/eslint-plugin/guard',
  );
  const create = (lint?: boolean) =>
    unpluginFactory(lint === undefined ? {} : { lint }, {} as never) as any;
  const run = () => ({
    hooks: { run: { tap: (_name: string, fn: () => void) => fn() } },
  });

  beforeEach(() => startLintGuard.mockClear());

  it('starts on a webpack or rspack run', () => {
    create().webpack(run());
    create().rspack(run());
    expect(startLintGuard).toHaveBeenCalledTimes(2);
  });

  it('starts on a rollup or rolldown build outside watch mode', () => {
    const plugin = create();
    plugin.rollup.buildStart.call({ meta: { watchMode: true } });
    plugin.rolldown.buildStart.call({ meta: { watchMode: true } });
    expect(startLintGuard).not.toHaveBeenCalled();
    plugin.rollup.buildStart.call({ meta: { watchMode: false } });
    plugin.rolldown.buildStart.call({ meta: { watchMode: false } });
    expect(startLintGuard).toHaveBeenCalledTimes(2);
  });

  it('starts on a vite build and a farm production build', () => {
    const plugin = create();
    plugin.vite.config({}, { command: 'serve' });
    plugin.farm.config({ compilation: { mode: 'development' } });
    expect(startLintGuard).not.toHaveBeenCalled();
    plugin.vite.config({}, { command: 'build' });
    plugin.farm.config({ compilation: { mode: 'production' } });
    expect(startLintGuard).toHaveBeenCalledTimes(2);
  });

  it('lints with the spelling rule the options turn on', () => {
    const plugin = unpluginFactory(
      { withoutLogicalProperties: true },
      {} as never,
    ) as any;
    plugin.vite.config({}, { command: 'build' });
    expect(startLintGuard).toHaveBeenCalledWith({
      rules: { '@typedcss/no-logical-properties': 'error' },
    });
  });

  it('lints with the styling prop the options name', () => {
    const plugin = unpluginFactory({ styleProp: 'css' }, {} as never) as any;
    plugin.vite.config({}, { command: 'build' });
    expect(startLintGuard).toHaveBeenCalledWith({
      settings: { typedcss: { styleProp: 'css' } },
    });
  });

  it('does not start with lint: false', () => {
    const plugin = create(false);
    plugin.webpack(run());
    plugin.rollup.buildStart.call({ meta: { watchMode: false } });
    plugin.vite.config({}, { command: 'build' });
    plugin.farm.config({ compilation: { mode: 'production' } });
    expect(startLintGuard).not.toHaveBeenCalled();
  });
});
