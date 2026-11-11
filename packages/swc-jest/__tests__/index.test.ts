import * as path from 'path';
import * as oxide from '@typedcss/oxide';
import swcJest, { createTransformer } from '../src';

jest.mock('@typedcss/oxide', () => {
  const actual = jest.requireActual('@typedcss/oxide');
  return { ...actual, transform: jest.fn(actual.transform) };
});

const mockTransform = oxide.transform as jest.MockedFunction<
  typeof oxide.transform
>;
const rootDir = path.resolve(__dirname, '..');
const filename = path.join(rootDir, 'fixture.tsx');
const jestOptions = {
  config: { rootDir },
  supportsStaticESM: false,
} as unknown as Parameters<
  NonNullable<ReturnType<typeof createTransformer>['process']>
>[2];

const source = `import * as css from '@typedcss/css';
const styles = css.create({ box: { padding: 16, color: 'red' } });
export const A = ({ n }: { n: number }) => <div sx={styles.box}>{n}</div>;
`;

const run = (src: string, options = {}) => {
  const transformer = createTransformer({ root: rootDir, ...options });
  return transformer.process(src, filename, jestOptions);
};

it('exposes createTransformer through the default export', () => {
  expect(swcJest.createTransformer).toBe(createTransformer);
});

it('compiles the styling prop away and emits CommonJS', () => {
  const { code } = run(source);

  expect(code).toMatch(/className: "xqqbxt1d xq96bg3w"/);
  expect(code).not.toMatch(/const styles =/);
  expect(code).not.toMatch(/\bsx:/);
  expect(code).not.toMatch(/^import /m);
});

it('passes a file without TypedCSS to swc unchanged in meaning', () => {
  const { code } = run('export const n: number = 1;\n');

  expect(code).toMatch(/exports\.n|n = 1/);
  expect(code).not.toMatch(/: number/);
});

it('uses the current directory by default and keeps source oxide skips', () => {
  mockTransform.mockReturnValueOnce(null);
  const transformer = createTransformer();
  const { code } = transformer.process(
    'export const n: number = 1;\n',
    filename,
    jestOptions,
  );

  expect(mockTransform).toHaveBeenLastCalledWith(
    'export const n: number = 1;\n',
    filename,
    { root: process.cwd() },
  );
  expect(code).toMatch(/exports\.n|n = 1/);
});

it('honours a custom styleProp', () => {
  const { code } = run(source.replace('sx', 'classStyle'), {
    styleProp: 'classStyle',
  });

  expect(code).toMatch(/className: "xqqbxt1d xq96bg3w"/);
  expect(code).not.toMatch(/\bclassStyle:/);
});

it('passes the transformer options to oxide', () => {
  run(source, { styleProp: 'sx', withoutLogicalProperties: true });

  expect(mockTransform).toHaveBeenLastCalledWith(source, filename, {
    root: rootDir,
    styleProp: 'sx',
    withoutLogicalProperties: true,
  });
});

it('keys the cache on the source and transformer options', () => {
  const key = (src: string, options = {}) =>
    createTransformer({ root: rootDir, ...options }).getCacheKey!(
      src,
      filename,
      jestOptions,
    );

  expect(key(source)).toBe(key(source));
  expect(key(source)).not.toBe(key(source.replace("'red'", "'blue'")));
  expect(key(source)).not.toBe(key(source, { styleProp: 'classStyle' }));
});

it('creates a cache key when the inner transformer has no cache key', () => {
  let isolatedCreateTransformer: typeof createTransformer;
  jest.isolateModules(() => {
    jest.doMock('@swc/jest', () => ({
      __esModule: true,
      default: {
        createTransformer: () => ({ process: jest.fn() }),
      },
    }));
    isolatedCreateTransformer = require('../src').createTransformer;
  });
  jest.dontMock('@swc/jest');

  expect(
    isolatedCreateTransformer!().getCacheKey!(source, filename, jestOptions),
  ).toMatch(/^[a-f0-9]{40}$/);
});

it('leaves TypedCSS styling in node_modules for swc to process', () => {
  const transformer = createTransformer({ root: rootDir });
  const dependencyFilename = path.join(rootDir, 'node_modules', 'fixture.tsx');
  const { code } = transformer.process(source, dependencyFilename, jestOptions);

  expect(code).toMatch(/sx: styles\.box/);
  expect(code).not.toMatch(/className:/);
  expect(code).not.toMatch(/^import /m);
});
