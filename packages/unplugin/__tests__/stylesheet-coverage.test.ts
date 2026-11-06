import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  compileStylesheet,
  DEFAULT_STYLE_PROP,
  isRelevant,
  PACKAGE,
} from '../src/stylesheet';

it('covers stylesheet defaults, cache reuse, overrides, and stale entries', () => {
  expect(PACKAGE).toBe('@typedcss/css');
  expect(DEFAULT_STYLE_PROP).toBe('sx');
  expect(isRelevant("export * from './theme';")).toBe(true);
  expect(isRelevant('export const value = 1;')).toBe(false);

  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-sheet-coverage-')),
  );
  const source = path.join(root, 'source.ts');
  const plain = path.join(root, 'plain.ts');
  fs.writeFileSync(source, "export * from './theme';");
  fs.writeFileSync(plain, 'export const value = 1;');
  const options = { cwd: root, root, include: ['*.ts'], exclude: [] };

  expect(compileStylesheet(options).files).toEqual([source]);
  expect(compileStylesheet(options).files).toEqual([source]);
  expect(
    compileStylesheet(
      options,
      new Map([[plain, 'export const stillPlain = 1;']]),
    ).files,
  ).toEqual([source]);
  fs.rmSync(source);
  expect(compileStylesheet(options).files).toEqual([]);

  const virtual = path.join(root, 'virtual.ts');
  expect(
    compileStylesheet(
      options,
      new Map([
        [virtual, "export * from './virtual-theme';"],
        [path.join(root, 'ignored.ts'), 'export const value = 1;'],
      ]),
    ).files,
  ).toEqual([virtual]);
  fs.rmSync(root, { recursive: true, force: true });
});

it('handles vanished files, filesystem failures, source dirs, and compiler failures', () => {
  jest.resetModules();
  let statMode: 'missing' | 'present' | 'denied' = 'missing';
  let compileFails = false;
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  jest.doMock('fs', () => ({
    ...jest.requireActual('fs'),
    statSync: () => {
      if (statMode === 'missing')
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      if (statMode === 'denied') throw denied;
      return { mtimeMs: 1 };
    },
    readFileSync: (file: string) =>
      file.includes('plain') ? 'export const x = 1;' : "export * from './x';",
  }));
  jest.doMock('@typedcss/oxide', () => ({
    ...jest.requireActual('@typedcss/oxide'),
    globFiles: (include: string[]) =>
      include.some((value) => value.includes('node_modules'))
        ? ['node_modules/pkg/src/pkg.ts']
        : ['source.ts', 'plain.ts'],
    needsCompile: () => false,
    compileCss: () => {
      if (compileFails) throw new Error('compile failed');
      return 'css';
    },
  }));
  jest.isolateModules(() => {
    const sheet =
      require('../src/stylesheet') as typeof import('../src/stylesheet');
    const options = { cwd: '/root', root: '/root' };
    expect(sheet.compileStylesheet(options).files).toEqual([]);

    statMode = 'present';
    expect(
      sheet.compileStylesheet({
        ...options,
        sourceDirs: ['/root/node_modules/pkg/src'],
        exclude: ['**/node_modules/**'],
      }).files,
    ).toEqual(['/root/source.ts', '/root/node_modules/pkg/src/pkg.ts']);
    sheet.compileStylesheet(options);

    compileFails = true;
    expect(() => sheet.compileStylesheet(options)).toThrow('compile failed');
    compileFails = false;

    statMode = 'denied';
    expect(() => sheet.compileStylesheet(options)).toThrow('denied');
  });
  jest.dontMock('fs');
  jest.dontMock('@typedcss/oxide');
});
