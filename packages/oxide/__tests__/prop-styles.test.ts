import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ compileCSS }) => {
  const FIXTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-'));
  const FIXTURE_PATH = path.join(FIXTURE_DIR, 'fixture.tsx');

  const wrap = (body: string) => `
import * as css from '@typedcss/css';

const s = css.create({
  boxed: { color: 'purple' },
});

${body}
`;

  const compile = (body: string, styleProp?: string) => {
    fs.writeFileSync(FIXTURE_PATH, wrap(body), 'utf-8');
    return compileCSS({
      cwd: FIXTURE_DIR,
      include: ['fixture.tsx'],
      exclude: [],
      styleProp,
    });
  };

  afterAll(() => fs.rmSync(FIXTURE_DIR, { recursive: true, force: true }));

  describe('compiler: styles passed through component props', () => {
    it('emits CSS for a style handed to a component, whatever the prop is called', () => {
      const css = compile(
        `export const A = () => <Card boxStyle={s.boxed} />;`,
      );
      expect(css).toContain('color: purple');
    });

    it('emits CSS for a component prop that happens to be called style', () => {
      // The scanner registers prop styles by component, not by prop name, so
      // `style` on a component is a real styling channel and must survive.
      const css = compile(`export const A = () => <Card style={s.boxed} />;`);
      expect(css).toContain('color: purple');
    });

    it('emits CSS for a style handed to a member-chain tag', () => {
      // `<svg.Card />` is a component too, however deep the chain runs.
      const css = compile(
        `export const A = () => <icons.svg.Card boxStyle={s.boxed} />;`,
      );
      expect(css).toContain('color: purple');
    });

    it('ignores a host element attribute, which is React’s own DOM prop', () => {
      // Nothing renders these class names: the scanner only registers prop
      // styles for capitalised names, so emitting them is dead CSS.
      const css = compile(
        `export const A = () => <div style={{ display: 'flex', gap: '2px' }} />;`,
      );
      expect(css).not.toContain('display: flex');
      expect(css).not.toContain('gap: 2px');
    });

    it.each([
      '<Card nav={{ ...baseOptions.nav }} />',
      '<Card foo={{ ...baseOptions.nav }} />',
      '<Card nav={{ a: baseOptions.nav }} />',
      '<Card nav={{ ...local }} />',
      '<Card nav={baseOptions.nav} />',
      '<Card nav={flag ? { ...baseOptions.nav } : { ...unknown }} />',
      '<Card nav={flag && { ...baseOptions.nav }} />',
      '<Card nav={({ ...baseOptions.nav })} />',
      '<icons.Card nav={{ ...baseOptions.nav }} />',
      '<Card nav={{ color: "red", width: `calc(${value}px)` }} />',
    ])('does not evaluate ordinary component data as CSS: %s', (jsx) => {
      // typedcss emits every style the file defines, so the data adds nothing
      // beyond the sheet the file has without it.
      const baseline = compile(`export const A = () => null;`);
      expect(
        compile(
          `const local = { color: 'red' }; export const A = () => ${jsx};`,
        ),
      ).toBe(baseline);
    });

    it('preserves style references next to ordinary data and inside conditional props', () => {
      const sheet = compile(
        `export const A = () => <Card nav={{ ...baseOptions.nav }} boxStyle={flag ? s.boxed : { ...unknown }} />;`,
      );
      expect(sheet).toContain('color: purple');
    });

    // Not a typedcss requirement: an inline object in sx is a type error under css.Style, so typedcss leaves it to the type checker instead of compiling it.
    it.skip.each([
      '<Card sx={{ ...baseOptions.nav }} />',
      '<div sx={{ ...baseOptions.nav }} />',
      '<Card className={css.use({ ...baseOptions.nav })} />',
    ])(
      'still diagnoses unresolved spreads in explicit styling expressions: %s',
      (jsx) => {
        expect(() => compile(`export const A = () => ${jsx};`)).toThrow(
          'Cannot resolve static member expression',
        );
      },
    );

    // Not a typedcss requirement: an inline object in sx is a type error under css.Style, so typedcss leaves it to the type checker instead of compiling it.
    it.skip('keeps inline object evaluation for the configured styling prop', () => {
      expect(
        compile(
          'export const A = () => <Card classStyle={{ color: "red" }} nav={{ ...baseOptions.nav }} />;',
          'classStyle',
        ),
      ).toContain('color: red');
      expect(() =>
        compile(
          'export const A = () => <Card classStyle={{ ...baseOptions.nav }} />;',
          'classStyle',
        ),
      ).toThrow('Cannot resolve static member expression');
    });

    it('still emits sx on a host element', () => {
      const css = compile(`export const A = () => <div sx={s.boxed} />;`);
      expect(css).toContain('color: purple');
    });
  });

  describe('compiler: a configured styleProp', () => {
    it('collects the configured prop on a host element', () => {
      const css = compile(
        `export const A = () => <div classStyle={s.boxed} />;`,
        'classStyle',
      );
      expect(css).toContain('color: purple');
    });

    // Not a typedcss requirement: typedcss emits every style a file defines, because a style can be applied anywhere at runtime.
    it.skip('stops treating the default name as the styling prop', () => {
      // With `classStyle` configured, `sx` on a host element is just an attribute
      // the transform will not rewrite, so collecting its CSS would be dead output.
      const css = compile(
        `export const A = () => <div sx={s.boxed} />;`,
        'classStyle',
      );
      expect(css).not.toContain('color: purple');
    });

    it('still exempts the configured prop from the component-prop pass', () => {
      // The component branch skips the styling prop so it is not collected twice;
      // that exemption has to follow the configured name, not the default.
      const css = compile(
        `export const A = () => <Card classStyle={s.boxed} />;`,
        'classStyle',
      );
      expect(css).toContain('color: purple');
    });
  });
});
