import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { implementations } from './implementations';

// Not a typedcss requirement: resolveExport finds the component a relayed style prop reaches; typedcss passes styles as values, and its links follow re-exports on their own (link_tests).
describe.skip.each(implementations)('$name', ({ scanAll, resolveExport }) => {
  const tmpDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-resolve-export-')),
  );
  const subFile = path.join(tmpDir, 'subExport.ts');
  const mainFile = path.join(tmpDir, 'mainExport.ts');
  const defaultAnonFile = path.join(tmpDir, 'defaultAnon.ts');
  const reExportImpFile = path.join(tmpDir, 'reExportImp.ts');
  const exportNamedSourceFile = path.join(tmpDir, 'exportNamedSource.ts');
  const exportAllSourceFile = path.join(tmpDir, 'exportAllSource.ts');
  const destructureFile = path.join(tmpDir, 'destructureExport.ts');
  const unresolvableFile = path.join(tmpDir, 'unresolvableExports.ts');
  const namedReExportFile = path.join(tmpDir, 'namedReExportSource.ts');

  beforeAll(() => {
    fs.writeFileSync(
      subFile,
      `
      import '@typedcss/css';
      export function subFunc() {}
      export class SubClass {}
      export const internalVar = 100;
      const unexported = 200;
      export { unexported as reExportedVar };
      export default function defaultSubFunc() {}
      `,
    );

    fs.writeFileSync(
      defaultAnonFile,
      `
      import '@typedcss/css';
      export default function() {}
      `,
    );

    fs.writeFileSync(
      reExportImpFile,
      `
      import '@typedcss/css';
      import { subFunc } from './subExport';
      export default subFunc;
      `,
    );

    fs.writeFileSync(
      exportNamedSourceFile,
      `
      import '@typedcss/css';
      export { SubClass } from './subExport';
      `,
    );

    fs.writeFileSync(
      exportAllSourceFile,
      `
      import '@typedcss/css';
      export * from './subExport';
      `,
    );

    fs.writeFileSync(
      namedReExportFile,
      `
      import '@typedcss/css';
      export { subFunc as reSubFunc } from './subExport';
      `,
    );

    fs.writeFileSync(
      destructureFile,
      `
      import '@typedcss/css';
      export const [destructA] = [10];
      export const { destructB } = { destructB: 20 };
      `,
    );

    fs.writeFileSync(
      unresolvableFile,
      `
      import '@typedcss/css';
      export { foo } from './non-existent-module-xyz';
      export * from './non-existent-module-abc';
      `,
    );

    fs.writeFileSync(
      mainFile,
      `
      import '@typedcss/css';
      import { subFunc, internalVar } from './subExport';
      export * from './subExport';
      export { SubClass as RenamedClass } from './subExport';
      export { internalVar as aliasImported };
      export default 123;
      `,
    );

    scanAll(tmpDir);
  });

  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  describe('resolveExport', () => {
    it.each([
      [
        'a function behind a star export',
        mainFile,
        'subFunc',
        subFile,
        'subFunc',
      ],
      [
        'a star export of another file',
        exportAllSourceFile,
        'subFunc',
        subFile,
        'subFunc',
      ],
      [
        'a renamed re-export',
        namedReExportFile,
        'reSubFunc',
        subFile,
        'subFunc',
      ],
      [
        'a class re-exported under another name',
        mainFile,
        'RenamedClass',
        subFile,
        'SubClass',
      ],
      [
        'an import exported under an alias',
        mainFile,
        'aliasImported',
        subFile,
        'internalVar',
      ],
      [
        'a re-export that names its source',
        exportNamedSourceFile,
        'SubClass',
        subFile,
        'SubClass',
      ],
      [
        'a local exported under another name',
        subFile,
        'reExportedVar',
        subFile,
        'unexported',
      ],
      // A default export declared with a name resolves to that binding, which is
      // not an export of its own: reading it as `default` loses the name the
      // component is keyed by everywhere else.
      [
        'a named default function',
        subFile,
        'default',
        subFile,
        'defaultSubFunc',
      ],
      [
        'an anonymous default function',
        defaultAnonFile,
        'default',
        defaultAnonFile,
        'default',
      ],
      ['a default expression', mainFile, 'default', mainFile, 'default'],
      [
        'a default that names an import',
        reExportImpFile,
        'default',
        subFile,
        'subFunc',
      ],
    ])('follows %s', (_name, file, exportName, filePath, localName) => {
      expect(resolveExport(file, exportName)).toEqual({ filePath, localName });
    });

    it('answers null for a directory', () => {
      expect(resolveExport(tmpDir, 'anything')).toBeNull();
    });

    it('answers null for a name the file does not export', () => {
      expect(resolveExport(subFile, 'missing')).toBeNull();
    });

    it('answers null for a re-export whose source does not resolve', () => {
      expect(resolveExport(unresolvableFile, 'foo')).toBeNull();
    });

    it('answers null for a file that does not exist', () => {
      expect(resolveExport(path.join(tmpDir, 'absent.ts'), 'a')).toBeNull();
    });

    it.each(['destructA', 'destructB'])(
      'answers null for the destructured export %s',
      (name) => {
        expect(resolveExport(destructureFile, name)).toBeNull();
      },
    );
  });
});
