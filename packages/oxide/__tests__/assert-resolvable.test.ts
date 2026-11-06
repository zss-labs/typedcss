import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ compileCSS, transformSource }) => {
  const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-'));
  const FIXTURE_PATH = path.join(FIXTURE_DIR, 'fixture.tsx');

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

  const compile = (body: string) => {
    fs.writeFileSync(FIXTURE_PATH, wrap(body), 'utf-8');
    return compileCSS({
      cwd: FIXTURE_DIR,
      include: ['fixture.tsx'],
      exclude: [],
    });
  };

  afterAll(() => fs.rmSync(FIXTURE_DIR, { recursive: true, force: true }));

  const UNSUPPORTED = /is not supported/;

  describe('compiler: assertResolvable', () => {
    // Not a typedcss requirement: typedcss merges sx and css.props at runtime, so a call is applied as whatever it returns.
    it.skip.each([
      [
        'a function call in sx',
        'export const A = () => <div sx={[styles.box, Test()]} />;',
      ],
      [
        'a function call nested in a ternary',
        'export const A = () => <div sx={cond ? Test() : styles.box} />;',
      ],
      [
        'a function call in css.use()',
        'export const cls = css.use(styles.box, Test());',
      ],
    ])('throws on %s', (_label, body) => {
      expect(() => compile(body)).toThrow(UNSUPPORTED);
    });

    // typedcss reads sx when it transforms the file.
    it('throws on an arrow function in sx', async () => {
      const source = wrap(
        'export const A = () => <div sx={[styles.box, () => styles.box]} />;',
      );
      fs.writeFileSync(FIXTURE_PATH, source, 'utf-8');
      await expect(
        transformSource({
          source,
          filePath: FIXTURE_PATH,
          root: FIXTURE_DIR,
          cwd: FIXTURE_DIR,
        }),
      ).rejects.toThrow(UNSUPPORTED);
    });

    // `Conditional` allows undefined, so this must keep compiling.
    it('accepts undefined as a conditional branch', () => {
      expect(() =>
        compile(
          'export const A = () => <div sx={cond ? styles.box : undefined} />;',
        ),
      ).not.toThrow();
    });
  });
});
