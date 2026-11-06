import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  const env = (source: string, filePath: string) => ({
    source,
    moduleId: filePath,
    filePath,
    root: DIR,
    cwd: DIR,
    styleProp: DEFAULT_STYLE_PROP,
    propertyPolicy: undefined,
    isDev: false,
    addDependency: () => {},
  });

  const wrap = (body: string) => `
import * as css from '@typedcss/css';

const styles = css.create({
  box: { color: 'red' },
});

function Test() {
  return 'x';
}

${body}
`;

  const run = (body: string): Promise<unknown> => {
    return transformSource(env(wrap(body), `${DIR}/fixture.tsx`));
  };

  const UNSUPPORTED = /is not supported/;

  describe('transform: assertResolvable', () => {
    // Not a typedcss requirement: typedcss merges sx at runtime, so a value the build cannot read is applied as whatever it holds.
    it.skip.each([
      [
        'a function call in sx',
        'export const A = () => <div sx={[styles.box, Test()]} />;',
      ],
      [
        'a function call nested in a ternary',
        'export const A = () => <div sx={cond ? Test() : styles.box} />;',
      ],
    ])('rejects %s', async (_label, body) => {
      await expect(run(body)).rejects.toThrow(UNSUPPORTED);
    });

    // Not a typedcss requirement: typedcss has no css.use.
    it.skip.each([
      [
        'a function call in css.use()',
        'export const cls = css.use(styles.box, Test());',
      ],
      [
        'an unresolvable member in css.use()',
        'export const cls = css.use(styles.box.missing);',
      ],
    ])('rejects %s', async (_label, body) => {
      await expect(run(body)).rejects.toThrow(UNSUPPORTED);
    });

    it('rejects an arrow function in sx', async () => {
      await expect(
        run(
          'export const A = () => <div sx={[styles.box, () => styles.box]} />;',
        ),
      ).rejects.toThrow(UNSUPPORTED);
    });

    // typedcss reads every definition, so the empty call is rejected where it
    // is written rather than where it is applied.
    it('rejects a keyframes call with no argument applied as a style', async () => {
      await expect(
        run(
          'const spin = css.keyframes();\nexport const A = () => <div sx={spin} />;',
        ),
      ).rejects.toThrow(
        'css.keyframes needs a style object it can read at build time',
      );
    });

    // `use` is variadic, so calling it with nothing is legal. @typedcss/css has
    // no runtime, so the call has to be compiled away rather than left behind.
    // Not a typedcss requirement: typedcss has no css.use.
    it.skip('compiles css.use() with no arguments away', async () => {
      const out = (await run('export const cls = css.use();')) as {
        code: string;
      };
      expect(out.code).toContain('export const cls = ""');
      expect(out.code).not.toMatch(/\bcss\.use\(/);
    });

    // A malformed call is TypeScript's to reject. The compiler skips it, the way
    // it already skips create(), viewTransitionClass(), createStatic() and createTheme().
    // Not a typedcss requirement: typedcss emits every style a file defines, so a definition it cannot read is rejected where it is written.
    it.skip('skips a keyframes call with no argument that is never applied', async () => {
      await expect(
        run('const spin = css.keyframes();\nexport const name = String(spin);'),
      ).resolves.toBeTruthy();
    });

    // `Conditional` allows undefined, so this must keep compiling.
    it('accepts undefined as a conditional branch', async () => {
      await expect(
        run(
          'export const A = () => <div sx={cond ? styles.box : undefined} />;',
        ),
      ).resolves.toBeTruthy();
    });
  });
});
