import { renderClass, getStyleRecords } from './implementations';
// States that hold at once settle their intersection by composition order, so
// the atom of the source written further right is weighted and becomes a class
// of its own. Reversing the composition has to reverse which class is weighted.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
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

  const HEAD = `
import * as css from '@typedcss/css';
const a = css.create({ s: { ':focus': { color: 'red' } } });
const b = css.create({ s: { ':hover': { color: 'blue' } } });
const c = css.create({ s: { ':active': { color: 'lime' } } });
const wide = css.create({
  s: { '@media (min-width: 700px)': { ':hover': { color: 'teal' } } },
});
`;

  const compile = async (styleExpr: string) => {
    const result = await transformSource(
      env(
        `${HEAD}export const B = ({ on }: any) => <div sx={${styleExpr}} />;`,
        `${DIR}/fixture.tsx`,
      ),
    );
    const code = typeof result === 'string' ? result : (result?.code ?? '');
    // typedcss merges at runtime, so the module itself is what gets evaluated.
    return code;
  };

  const classesOf = (code: string, on = true) =>
    renderClass(code, { on }, 'B').trim().split(/\s+/).filter(Boolean);

  describe('state escalation through the plugin', () => {
    it('gives the right-hand state a class the left-hand one does not have', async () => {
      const forward = classesOf(await compile('[a.s, b.s]'));
      const reversed = classesOf(await compile('[b.s, a.s]'));

      expect(forward).toHaveLength(2);
      expect(reversed).toHaveLength(2);
      expect(forward.sort()).not.toEqual(reversed.sort());
    });

    it('keeps the unweighted atom shared with a lone use', async () => {
      const [focusAlone] = classesOf(await compile('[a.s]'));
      const [hoverAlone] = classesOf(await compile('[b.s]'));

      const forward = classesOf(await compile('[a.s, b.s]'));
      const reversed = classesOf(await compile('[b.s, a.s]'));

      expect(forward).toContain(focusAlone);
      expect(forward).not.toContain(hoverAlone);
      expect(reversed).toContain(hoverAlone);
      expect(reversed).not.toContain(focusAlone);
    });

    it('weights three states apart from each other', async () => {
      const classes = classesOf(await compile('[a.s, b.s, c.s]'));

      expect(new Set(classes).size).toBe(3);
      expect(classes).toContain(classesOf(await compile('[a.s]'))[0]);
      expect(classes).not.toContain(classesOf(await compile('[b.s]'))[0]);
      expect(classes).not.toContain(classesOf(await compile('[c.s]'))[0]);
    });

    it('leaves a state behind a differing at-rule unweighted', async () => {
      const classes = classesOf(await compile('[wide.s, a.s]'));

      expect(classes).toContain(classesOf(await compile('[a.s]'))[0]);
      expect(classes).toContain(classesOf(await compile('[wide.s]'))[0]);
    });

    it('weights a state contributed by a condition', async () => {
      const classes = classesOf(await compile('[a.s, on && b.s]'));

      expect(classes).toContain(classesOf(await compile('[a.s]'))[0]);
      expect(classes).not.toContain(classesOf(await compile('[b.s]'))[0]);
    });

    // typedcss cannot see every composition, so each state atom ships its
    // weighted variants and the runtime picks one.
    it('emits the weighted variant the runtime picks', async () => {
      const [, weighted] = classesOf(await compile('[a.s, b.s]'));
      fs.writeFileSync(
        `${DIR}/fixture.tsx`,
        `${HEAD}export const B = () => null;`,
      );
      const sheet = compileCSS({
        include: ['fixture.tsx'],
        exclude: [],
        cwd: DIR,
      });
      expect(weighted).toMatch(/-w1$/);
      expect(sheet).toContain(`.${weighted}:not(#\\#):not(#\\#):hover`);
    });

    it('emits no weighted variant for a state no other selector shares', async () => {
      fs.writeFileSync(
        `${DIR}/alone.tsx`,
        `import * as css from '@typedcss/css';
const a = css.create({ s: { ':focus': { color: 'red' } }, t: { ':hover': { padding: 4 } } });
export const B = () => <div sx={[a.s, a.t]} />;`,
      );
      const sheet = compileCSS({
        include: ['alone.tsx'],
        exclude: [],
        cwd: DIR,
      });
      expect(sheet).toContain(':focus');
      expect(sheet).not.toContain('-w1');
    });

    const sheetOf = (name: string, source: string) => {
      fs.writeFileSync(`${DIR}/${name}`, source);
      return compileCSS({ include: [name], exclude: [], cwd: DIR });
    };

    it('weights a fourth colliding state past two', async () => {
      const source = `import * as css from '@typedcss/css';
const a = css.create({ s: { ':focus': { color: 'red' } } });
const b = css.create({ s: { ':hover': { color: 'blue' } } });
const c = css.create({ s: { ':active': { color: 'lime' } } });
const d = css.create({ s: { ':focus-visible': { color: 'navy' } } });
export const B = () => <div sx={[a.s, b.s, c.s, d.s]} />;`;
      const classes = renderClass(
        (await transformSource(env(source, `${DIR}/four.tsx`))).code,
        {},
        'B',
      ).split(' ');
      const weighted = classes.find((name) => name.endsWith('-w3'));
      expect(weighted).toBeDefined();
      expect(sheetOf('four.tsx', source)).toContain(`.${weighted}:not(`);
    });

    // A longhand wins wherever it meets its shorthand. Weighting the shorthand
    // for composition order must not take that away, so the longhand is
    // weighted with it.
    it('keeps a longhand above a shorthand weighted past it', async () => {
      const source = `import * as css from '@typedcss/css';
const a = css.create({ s: { ':hover': { marginTop: 1 } } });
const b = css.create({ s: { ':hover': { margin: 0 } } });
const c = css.create({ s: { ':focus': { margin: 8 } } });
const d = css.create({ s: { ':active': { margin: 4 } } });
export const B = () => <div sx={[a.s, b.s, c.s, d.s]} />;`;
      const code = (await transformSource(env(source, `${DIR}/repair.tsx`)))
        .code;
      const [top] = getStyleRecords({ ':hover': { marginTop: 1 } } as never);
      const classes = renderClass(code, {}, 'B').split(' ');
      expect(classes).toContain(`${top.hash}-w1`);
      expect(sheetOf('repair.tsx', source)).toContain(`.${top.hash}-w1:not(`);
    });
  });
});
