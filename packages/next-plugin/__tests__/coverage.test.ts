jest.mock('../src/lint', () => ({ startNextLintGuard: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startNextLintGuard } from '../src/lint';
import { oxide } from '../src/oxide';
import withTypedCSS, { withTypedCSS as namedWithTypedCSS } from '../src/index';
import {
  DEV_BRIDGE_ID,
  DEV_BRIDGE_WINDOW_MS,
  devBridge,
  generationMarker,
  readGenerations,
} from '../src/dev-bridge';
import { carryStylesheet } from '../src/dev-bridge-client';
import {
  compileStylesheet,
  optionsOf,
  sourcePackagesOf,
  transform,
  VIRTUAL_FILE_PATH,
} from '../src/shared';

const ENV = process.env.NODE_ENV;

afterEach(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = ENV;
  jest.restoreAllMocks();
  delete (global as any).document;
  delete (global as any).MutationObserver;
});

it('covers loader option defaults and query fallbacks', () => {
  expect(VIRTUAL_FILE_PATH).toContain('zero-virtual.css');
  const cwd = jest.spyOn(process, 'cwd').mockReturnValue('/fallback');
  expect(
    optionsOf({ resourcePath: '', addDependency() {}, query: 'x' }),
  ).toMatchObject({
    cwd: '/fallback',
    root: '/fallback',
    styleProp: 'sx',
  });
  expect(
    optionsOf({
      resourcePath: '',
      addDependency() {},
      query: {
        cwd: '/cwd',
        root: '/root',
        styleProp: '$',
        include: ['a'],
        exclude: ['b'],
      },
    }),
  ).toMatchObject({
    cwd: '/cwd',
    root: '/root',
    styleProp: '$',
    include: ['a'],
    exclude: ['b'],
  });
  expect(
    optionsOf({
      resourcePath: '',
      addDependency() {},
      getOptions: () => undefined,
      query: { cwd: '/ignored' },
    }),
  ).toMatchObject({ cwd: '/ignored' });
  cwd.mockRestore();
});

it('caches source packages and delegates transforms', () => {
  const sourcePackages = jest
    .spyOn(oxide, 'sourcePackages')
    .mockReturnValue([]);
  expect(sourcePackagesOf('/coverage-cache')).toEqual([]);
  expect(sourcePackagesOf('/coverage-cache')).toEqual([]);
  expect(sourcePackages).toHaveBeenCalledTimes(1);

  const transformed = { code: 'done' } as any;
  const transformSpy = jest
    .spyOn(oxide, 'transform')
    .mockReturnValue(transformed);
  const options = optionsOf({
    resourcePath: '',
    addDependency() {},
    query: { cwd: '/cwd' },
  });
  expect(transform('source', '/file.ts', options)).toBe(transformed);
  expect(transformSpy).toHaveBeenCalledWith('source', '/file.ts', options);
});

it('handles vanished files, stale cache entries, irrelevant files, and compiler failures', () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-next-coverage-')),
  );
  const relevant = path.join(root, 'relevant.ts');
  const irrelevant = path.join(root, 'irrelevant.ts');
  fs.writeFileSync(relevant, "export * from './other';");
  fs.writeFileSync(irrelevant, 'export const n = 1;');
  const options = optionsOf({
    resourcePath: relevant,
    addDependency() {},
    query: { cwd: root, root, include: ['*.ts'], exclude: [] },
  });

  compileStylesheet(options);
  compileStylesheet(options);
  fs.rmSync(relevant);
  compileStylesheet(options);

  const compile = jest.spyOn(oxide, 'compileCss').mockImplementationOnce(() => {
    throw new Error('compile');
  });
  expect(() => compileStylesheet(options)).toThrow('compile');
  compile.mockRestore();

  fs.rmSync(root, { recursive: true, force: true });
});

it('rethrows filesystem errors other than a vanished file', () => {
  jest.resetModules();
  const error = Object.assign(new Error('denied'), { code: 'EACCES' });
  let mode: 'missing' | 'present' | 'denied' = 'missing';
  jest.doMock('fs', () => ({
    ...jest.requireActual('fs'),
    statSync: () => {
      if (mode === 'missing')
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      if (mode === 'denied') throw error;
      return { mtimeMs: 1 };
    },
    readFileSync: () => "export * from './other';",
  }));
  jest.doMock('../src/oxide', () => ({
    oxide: {
      sourcePackages: () => [],
      globFiles: () => ['file.ts'],
      compileCss: jest.fn(),
    },
  }));
  jest.isolateModules(() => {
    const shared = require('../src/shared') as typeof import('../src/shared');
    const options = shared.optionsOf({
      resourcePath: '',
      addDependency() {},
      query: { cwd: '/root' },
    });
    expect(shared.compileStylesheet(options).found).toEqual(new Set());
    mode = 'present';
    expect(shared.compileStylesheet(options).found).toEqual(
      new Set(['/root/file.ts']),
    );
    shared.compileStylesheet(options);
    mode = 'missing';
    shared.compileStylesheet(options);
    mode = 'denied';
    expect(() => shared.compileStylesheet(options)).toThrow('denied');
  });
  jest.dontMock('fs');
  jest.dontMock('../src/oxide');
});

it('covers Next defaults, linting, package roots, aliases, and unusual style props', () => {
  const lint = startNextLintGuard as jest.Mock;
  const sourcePackages = jest.spyOn(oxide, 'sourcePackages');
  sourcePackages.mockReturnValueOnce([]);
  const defaults = withTypedCSS();
  expect(namedWithTypedCSS).toBe(withTypedCSS);
  expect(lint).toHaveBeenCalledTimes(1);
  expect(defaults.turbopack?.rules?.['*.tsx']).toBeDefined();

  sourcePackages.mockReturnValueOnce([
    {
      name: 'pkg',
      dir: '/repo/node_modules/pkg',
      sourceDirs: ['/repo/node_modules/pkg', '/elsewhere'],
      exports: { typedcss: './src.ts', default: './dist.js' },
    } as any,
  ]);
  const config = withTypedCSS(
    {},
    { lint: false, root: '/repo', styleProp: '$x.' },
  );
  expect(config.transpilePackages).toEqual(['pkg']);
  expect(config.turbopack?.resolveAlias).toHaveProperty('pkg');
  const rule = config.turbopack?.rules?.['*.tsx'] as any;
  expect(rule.condition.all[1].content.test('$x.')).toBe(true);

  sourcePackages.mockReturnValueOnce([
    {
      name: 'entries',
      dir: '/repo/node_modules/entries',
      sourceDirs: ['/repo/node_modules/entries/src'],
      exports: { '.': null, './ok': { typedcss: './src.ts' } },
    } as any,
  ]);
  expect(
    withTypedCSS({}, { lint: false, root: '/repo' }).turbopack?.resolveAlias,
  ).toHaveProperty('entries/ok');
});

it('handles generation files, old edits, repeated edits, and compile failures', () => {
  expect(readGenerations('/missing')).toEqual([]);
  expect(DEV_BRIDGE_WINDOW_MS).toBe(30_000);
  expect(generationMarker('x')).toContain('data-typedcss-generation');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-generations-'));
  const stored = path.join(root, 'stored.json');
  fs.writeFileSync(stored, JSON.stringify(['a', 1, 'b']));
  expect(readGenerations(stored)).toEqual(['a', 'b']);
  fs.writeFileSync(stored, '{}');
  expect(readGenerations(stored)).toEqual([]);

  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  const file = path.join(root, 'app.tsx');
  fs.writeFileSync(file, 'x');
  const old = new Date(Date.now() - 31_000);
  fs.utimesSync(file, old, old);
  const options = optionsOf({
    resourcePath: file,
    addDependency() {},
    query: { root, cwd: root },
  });
  expect(devBridge(file, 'one', options)).toBe('');
  expect(devBridge(file, 'two', options)).toBe('');
  expect(devBridge('/missing-file', 'one', options)).toBe('');
  expect(devBridge('/missing-file', 'two', options)).toBe('');

  fs.utimesSync(file, new Date(), new Date());
  expect(devBridge(file, 'three', options)).toContain(DEV_BRIDGE_ID);
  expect(devBridge(file, 'three', options)).toContain(DEV_BRIDGE_ID);
  jest.spyOn(oxide, 'compileCss').mockImplementationOnce(() => {
    throw new Error('compile');
  });
  expect(devBridge(file, 'four', options)).toBe('');
  fs.rmSync(root, { recursive: true, force: true });
});

it('covers stylesheet bridge races and inaccessible sheets', () => {
  carryStylesheet('.x{}', 'id', DEV_BRIDGE_ID);

  const head: any[] = [];
  const sheets: any[] = [];
  let settle = () => {};
  const disconnect = jest.fn();
  const removeEventListener = jest.fn();
  (global as any).MutationObserver = class {
    constructor(callback: () => void) {
      settle = callback;
    }
    observe() {}
    disconnect() {
      disconnect();
    }
  };
  (global as any).document = {
    get styleSheets() {
      return sheets;
    },
    getElementById: (id: string) => head.find((node) => node.id === id) ?? null,
    createElement: () => {
      const node: any = {
        dataset: {},
        remove: jest.fn(() => head.splice(head.indexOf(node), 1)),
      };
      return node;
    },
    head: {
      appendChild: (node: any) => {
        if (!head.includes(node)) head.push(node);
      },
    },
    addEventListener: jest.fn(),
    removeEventListener,
  };

  const current: any = {
    id: DEV_BRIDGE_ID,
    dataset: { generation: 'old' },
    remove: jest.fn(),
  };
  head.push(current);
  sheets.push({ ownerNode: current, cssRules: [] });
  sheets.push({
    ownerNode: {},
    get cssRules() {
      throw new Error('cross-origin');
    },
  });
  carryStylesheet('.x{}', 'new', DEV_BRIDGE_ID);
  current.dataset.generation = 'newer';
  settle();
  expect(disconnect).toHaveBeenCalled();
  expect(removeEventListener).toHaveBeenCalled();

  head.length = 0;
  sheets.length = 0;
  carryStylesheet('.x{}', 'landed', DEV_BRIDGE_ID);
  settle();
  sheets.push({
    ownerNode: {},
    cssRules: [{ selectorText: undefined }, { selectorText: '.landed' }],
  });
  settle();
  expect(head).toHaveLength(0);

  const existing: any = {
    id: DEV_BRIDGE_ID,
    dataset: { generation: 'same' },
    remove: jest.fn(),
  };
  head.push(existing);
  sheets.push({ ownerNode: {}, cssRules: [{ selectorText: '.same' }] });
  carryStylesheet('.x{}', 'same', DEV_BRIDGE_ID);
  expect(existing.remove).toHaveBeenCalled();
});
