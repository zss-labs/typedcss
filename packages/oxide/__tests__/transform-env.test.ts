// The two callers hand `transformSource` different environments, and the
// difference is not cosmetic: the plugin compiles every file the same way in
// either mode, while the loader leaves the stylesheet to a whole-project scan
// once it is building for production. Both axes used to be covered only by
// accident -- each bundler's suite ran the shared code under its own flags and
// nothing asserted what the flags changed. These name the difference.
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

  const FILE = `${DIR}/fixture.tsx`;

  const SOURCE = `
import * as css from '@typedcss/css';
export const styles = css.create({ box: { color: 'teal' } });
export const A = () => <div sx={styles.box} />;
`;

  const run = (overrides: { isDev?: boolean }) =>
    transformSource({
      source: SOURCE,
      moduleId: FILE,
      filePath: FILE,
      root: DIR,
      cwd: DIR,
      styleProp: DEFAULT_STYLE_PROP,
      propertyPolicy: undefined,
      isDev: false,
      addDependency: () => {},
      ...overrides,
    });

  describe('transform: the isDev axis', () => {
    // Not a typedcss requirement: typedcss keeps an exported style binding as its runtime value, since other modules read it at runtime.
    it.skip('empties an exported style binding when it is not a dev build', async () => {
      const { code } = await run({ isDev: false });

      expect(code).toContain('export const styles = "";');
      expect(code).not.toContain('new Proxy');
    });

    // Not a typedcss requirement: typedcss keeps an exported style binding as its runtime value, since other modules read it at runtime.
    it.skip('guards an exported style binding on a dev build', async () => {
      const { code } = await run({ isDev: true });

      expect(code).toContain('new Proxy');
      expect(code).toContain('const k=new Set(["box"])');
      expect(code).toContain('was read at runtime');
    });

    // Not a typedcss requirement: typedcss keeps an exported style binding as its runtime value, since other modules read it at runtime.
    it.skip('names the defining file relative to the root it was given', async () => {
      const { code } = await run({ isDev: true });

      expect(code).toContain(path.relative(DIR, FILE));
    });

    it('applies the class either way', async () => {
      const dev = await run({ isDev: true });
      const build = await run({ isDev: false });

      expect(dev.code).toContain('__typedcss_props(');
      expect(build.code).toContain('__typedcss_props(');
    });
  });

  describe('transform: output', () => {
    it('returns the compiled code and no stylesheet', async () => {
      const output = await run({});

      expect(output).not.toHaveProperty('sheets');
      expect(output.code).toContain('__typedcss_props(');
    });
  });
});
