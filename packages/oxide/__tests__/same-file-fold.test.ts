import * as oxide from '../index';
import { evaluateModule, renderProps } from './implementations';

const root = '/tmp/typedcss-static-fold';
const filename = `${root}/fixture.tsx`;
const head = `import * as css from '@typedcss/css';
const s = css.create({
  base: { padding: 20, color: 'black', backgroundColor: 'lightblue' },
  override: { color: 'white' },
  longhand: { paddingTop: 4 },
  empty: {},
  hover: { ':hover': { color: 'red', padding: 12 } },
  focus: { ':focus': { color: 'blue', paddingTop: 8 } },
  active: { ':active': { color: 'green', padding: 6 } },
  checked: { ':checked': { color: 'purple' } },
  wide: { '@media (min-width: 700px)': { ':hover': { color: 'teal', padding: 10 } } },
  compound: { ':hover:active': { paddingTop: 2, color: 'orange' } },
  variable: { '--ink': 'red', color: 'var(--ink)' },
});`;

const compile = (source: string) => {
  const code = oxide.transform(source, filename, { root });
  expect(code).not.toBeNull();
  const css = oxide.compileCss({ root, files: [{ path: filename, source }] });
  return { code: code!, css };
};

describe('same-file static compositions', () => {
  test.each([
    's.base',
    '[s.base, s.override]',
    '[s.override, s.base]',
    '[s.base, s.longhand]',
    '[s.longhand, s.base]',
    '[s.base, [s.override, [s.base]]]',
    '[null, s.base, false, , [s.empty]]',
    '[s.empty, null, false]',
    '[s.hover, s.focus]',
    '[s.focus, s.hover]',
    '[s.hover, s.focus, s.active]',
    '[s.checked, s.active, s.focus, s.hover]',
    '[s.hover, s.focus, s.hover]',
    '[s.wide, s.focus, s.hover]',
    '[s.hover, s.active, s.compound]',
    '[s.compound, s.active, s.hover]',
    '[s.variable, s.override]',
  ])('matches the exact runtime class string: %s', (expression) => {
    const { code, css } = compile(`${head}
export const expected = css.props(${expression});
export const A = () => <div sx={${expression}} />;`);
    expect(code).not.toContain('__typedcss_props');
    const { expected } = evaluateModule(code);
    const actual = renderProps(code);
    expect(actual).toEqual(expected);
    for (const name of (actual.className ?? '').split(' ').filter(Boolean)) {
      expect(css).toContain(`.${name}`);
    }
  });

  test('preserves both runtime composition and exported maps', () => {
    const { code } = compile(`${head}
export { s };
export const A = ({ received }) => <div sx={[s.base, received]} />;
export const Fixed = () => <div sx={s.base} />;`);
    expect(code).toContain('__typedcss_props(s.base, received)');
    const { s } = evaluateModule(code);
    expect(s.base.$$css).toBe(true);
    expect(renderProps(code, { received: s.override }).className).toBeDefined();
  });

  test('empty styles preserve classes from earlier spreads', () => {
    const { code } = compile(`${head}
export const A = () => <div {...{ className: 'external' }} sx={s.empty} />;`);
    expect(renderProps(code)).toEqual({ className: 'external' });
  });
});
