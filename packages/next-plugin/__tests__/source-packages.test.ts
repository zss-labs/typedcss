// A dependency exporting typedcss source is transpiled by Next.js, aliased to
// that source for Turbopack, passed through the loader, and scanned for the
// stylesheet.
jest.mock('../src/lint', () => ({ startNextLintGuard: jest.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { withTypedCSS } from '../src/index';
import { compileStylesheet, inSourcePackage, optionsOf } from '../src/shared';

const ROOT = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-next-package-')),
);
const PKG = path.join(ROOT, 'node_modules', 'ui-kit');

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeAll(() => {
  write(
    path.join(ROOT, 'package.json'),
    JSON.stringify({ dependencies: { 'ui-kit': '1.0.0' } }),
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
  write(
    path.join(PKG, 'src', 'Button.tsx'),
    `import * as css from '@typedcss/css';
const styles = css.create({ base: { color: 'rgb(1, 2, 3)' } });
export const Button = () => <button sx={styles.base} />;
`,
  );
  write(
    path.join(PKG, 'src', 'Button.test.tsx'),
    `import * as css from '@typedcss/css';
const styles = css.create({ probe: { color: 'rgb(7, 7, 7)' } });
export const Probe = () => <div sx={styles.probe} />;
`,
  );
  jest.spyOn(process, 'cwd').mockReturnValue(ROOT);
});

afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

const optionsWith = (exclude?: string[]) =>
  optionsOf({
    resourcePath: path.join(ROOT, 'app', 'page.tsx'),
    addDependency: () => {},
    getOptions: () => ({
      root: ROOT,
      cwd: ROOT,
      ...(exclude ? { exclude } : {}),
    }),
  });

it('transpiles the package and aliases its exports for Turbopack', () => {
  const config = withTypedCSS(
    {
      transpilePackages: ['other'],
      turbopack: { resolveAlias: { 'ui-kit': './custom.ts' } },
    },
    { lint: false },
  );

  expect(config.transpilePackages).toEqual(['other', 'ui-kit']);
  expect(config.turbopack?.resolveAlias).toEqual({
    'ui-kit': './custom.ts',
    'ui-kit/*': './node_modules/ui-kit/src/*.tsx',
  });
});

it('runs the loader on package source despite the foreign condition', () => {
  const config = withTypedCSS({}, { lint: false });
  const rule = config.turbopack?.rules?.['*.tsx'] as any;
  const [packageOrApp] = rule.condition.all;
  const fromPackage = packageOrApp.any[1].path as RegExp;

  expect(packageOrApp.any[0]).toEqual({ not: 'foreign' });
  expect(fromPackage.test('node_modules/ui-kit/src/Button.tsx')).toBe(true);
  expect(
    fromPackage.test(
      'node_modules/.pnpm/ui-kit@1.0.0/node_modules/ui-kit/src/Button.tsx',
    ),
  ).toBe(true);
  expect(fromPackage.test('node_modules/ui-kit/dist/index.js')).toBe(false);
  expect(fromPackage.test('node_modules/ui-kitx/src/a.tsx')).toBe(false);
});

it('leaves the config alone without source packages', () => {
  (process.cwd as jest.Mock).mockReturnValueOnce(
    path.join(ROOT, 'node_modules'),
  );
  const config = withTypedCSS({}, { lint: false });

  expect(config.transpilePackages).toBeUndefined();
  expect(config.turbopack?.resolveAlias).toBeUndefined();
  expect((config.turbopack!.rules!['*.tsx'] as any).condition.all[0]).toEqual({
    not: 'foreign',
  });
});

it('tells package source from the rest of node_modules', () => {
  expect(inSourcePackage(ROOT, path.join(PKG, 'src', 'Button.tsx'))).toBe(true);
  expect(inSourcePackage(ROOT, path.join(PKG, 'dist', 'index.js'))).toBe(false);
  expect(
    inSourcePackage(ROOT, path.join(ROOT, 'node_modules', 'x', 'a.ts')),
  ).toBe(false);
});

it('collects every file under the exported source directory by default', () => {
  const { css } = compileStylesheet(optionsWith());

  expect(css).toContain('rgb(1, 2, 3)');
  expect(css).toContain('rgb(7, 7, 7)');
});

it.each(['**/node_modules/**', 'node_modules/**'])(
  'keeps package styles when exclude carries the broad %s pattern',
  (pattern) => {
    const { css } = compileStylesheet(optionsWith([pattern, '**/.next/**']));

    expect(css).toContain('rgb(1, 2, 3)');
  },
);

it('honors an explicit exclude that names a path inside node_modules', () => {
  const { css } = compileStylesheet(
    optionsWith([
      '**/node_modules/**',
      '**/node_modules/ui-kit/src/**/*.test.tsx',
    ]),
  );

  expect(css).toContain('rgb(1, 2, 3)');
  expect(css).not.toContain('rgb(7, 7, 7)');
});
