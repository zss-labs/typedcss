// A dynamic function key resolves to a class name plus a custom property on the
// element. Only the class is knowable from the component that receives the
// style through a prop, so the key it is handed travels with the values the
// caller computed, and the receiving element spreads them into its own style.
// Written inline or handed over a prop, the element has to end up the same.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_STYLE_PROP,
  getStyleRecords,
  deepMerge,
  hostElement,
  loadProject,
} from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  const STYLES = path.join(DIR, 'styles.ts');
  const INLINE = path.join(DIR, 'Inline.tsx');
  const LEAF = path.join(DIR, 'Leaf.tsx');
  const MERGED = path.join(DIR, 'Merged.tsx');
  const USED = path.join(DIR, 'Used.tsx');
  const RELAY = path.join(DIR, 'Relay.tsx');
  const GATED = path.join(DIR, 'Gated.tsx');
  const UNREADABLE = path.join(DIR, 'Unreadable.tsx');
  const USED_PLAIN = path.join(DIR, 'UsedPlain.tsx');
  const PARENT = path.join(DIR, 'Parent.tsx');
  const MIXED = path.join(DIR, 'Mixed.tsx');

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

  const BASE = { backgroundColor: 'green', padding: 24 };

  const files: Record<string, string> = {
    [STYLES]: `
import * as css from '@typedcss/css';
export const styles = css.create({
  base: ${JSON.stringify(BASE)},
  tone: (c: string) => ({ backgroundColor: c }),
  sized: (n: number) => ({ padding: n, zIndex: n }),
  tinted: (c = 'teal') => ({ color: c }),
  unread: (c: string) => ({ color: 'olive' }),
});
`,
    [INLINE]: `
import '@typedcss/css';
import { styles } from './styles';
export const Inline = ({ color, n }: { color: string; n: number }) => (
  <div>
    <div sx={styles.tone(color)} />
    <div sx={styles.sized(n)} />
    <div sx={styles.tinted()} />
  </div>
);
`,
    [LEAF]: `
import * as css from '@typedcss/css';
export const Leaf = ({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={styleArray} />
);
`,
    [MERGED]: `
import * as css from '@typedcss/css';
import { styles } from './styles';
export const Merged = ({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={[styles.base, styleArray]} />
);
`,
    [USED]: `
import * as css from '@typedcss/css';
export const Used = ({ styleArray }: { styleArray?: css.Style }) => (
  <div {...css.props(styleArray)} />
);
`,
    [RELAY]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
export const Relay = ({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={styleArray} />
);
`,
    [GATED]: `
import * as css from '@typedcss/css';
export const Gated = ({ on, styleArray }: { on: boolean; styleArray?: css.Style }) => (
  <div sx={on && styleArray} />
);
`,
    [USED_PLAIN]: `
import * as css from '@typedcss/css';
export const UsedPlain = ({ plain }: { plain?: css.Style }) => (
  <div {...css.props(plain)} />
);
`,
    // The scan cannot read a runtime condition inside an array, so this call
    // site keeps its array and reaches the same prop the carriers do.
    [UNREADABLE]: `
import '@typedcss/css';
import { styles } from './styles';
import { Leaf } from './Leaf';
export const Unreadable = ({ on }: { on: boolean }) => (
  <Leaf styleArray={[on && styles.base, styles.tinted]} />
);
`,
    [MIXED]: `
import '@typedcss/css';
import { styles } from './styles';
import { Leaf } from './Leaf';
export const Mixed = ({ color, flag }: { color: string; flag: boolean }) => (
  <div>
    <Leaf styleArray={[styles.base, flag && styles.base, styles.tone(color)]} />
    <div sx={[styles.base, styles.tone(color)]} />
  </div>
);
`,
    [PARENT]: `
import '@typedcss/css';
import { styles } from './styles';
import { Leaf } from './Leaf';
import { Merged } from './Merged';
import { Used } from './Used';
import { Relay } from './Relay';
import { Gated } from './Gated';
import { UsedPlain } from './UsedPlain';

export const Parent = ({
  color,
  n,
  flag,
}: {
  color: string;
  n: number;
  flag: boolean;
}) => (
  <div>
    <Leaf styleArray={styles.tone(color)} />
    <Leaf styleArray={styles.sized(n)} />
    <Leaf styleArray={styles.tinted()} />
    <Merged styleArray={styles.tone(color)} />
    <Used styleArray={styles.tone(color)} />
    <Relay styleArray={styles.tone(color)} />
    <UsedPlain plain={styles.unread(color)} />
    <Gated on styleArray={flag ? styles.tone(color) : styles.base} />
  </div>
);
`,
  };

  const run = async (file: string): Promise<string> => {
    const result = await transformSource(env(files[file], file));
    return result.code;
  };

  const classesOf = (style: Record<string, unknown>) =>
    getStyleRecords(style as never)
      .map((record) => record.hash)
      .sort()
      .join(' ');

  const norm = (value: string) => value.trim().split(/\s+/).sort().join(' ');

  // Plumeria hands a dynamic key over a prop as a key paired with the values
  // the caller computed. typedcss passes the style value itself, which carries
  // its own variables, so each case renders and compares what the element gets.
  type Rendered = { className: string; style: Record<string, unknown> };
  const shape = (props: Record<string, any> | undefined): Rendered => ({
    className: norm(String(props?.className ?? '')),
    style: props?.style ?? {},
  });

  let load: (file: string) => Record<string, any>;
  const PROPS = { color: 'red', n: 8, flag: true };
  const childrenOf = (element: any): Rendered[] =>
    (element.props.children as unknown[]).map((child) =>
      shape(hostElement(child)?.props),
    );
  const parent = (flag = true) =>
    childrenOf(load(PARENT).Parent({ ...PROPS, flag }));
  const inline = () => childrenOf(load(INLINE).Inline(PROPS));

  beforeAll(async () => {
    for (const [p, src] of Object.entries(files)) fs.writeFileSync(p, src);
    const codes: Record<string, string> = {};
    for (const file of Object.keys(files)) {
      if (file === UNREADABLE) continue;
      codes[file] = await run(file);
    }
    load = loadProject(codes);
  });

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  describe('transform: a dynamic function key passed through a prop', () => {
    it('preserves readable styles and variables in a partially resolved array', () => {
      for (const flag of [false, true]) {
        const [passed, written] = childrenOf(
          load(MIXED).Mixed({ color: 'red', flag }),
        );
        expect(Object.values(passed.style)).toEqual(['red']);
        expect(passed).toEqual(written);
      }
    });

    it('hands the key and the values over together', () => {
      const [tone] = parent();
      expect(tone.className).toMatch(/^x[a-z0-9]+$/);
      expect(Object.values(tone.style)).toEqual(['red']);
    });

    it('lands the element the call would have written inline', () => {
      expect(parent()[0]).toEqual(inline()[0]);
    });

    it('carries a parameter that splits into two variables by unit', () => {
      const sized = parent()[1];
      expect(Object.values(sized.style)).toEqual(['8px', 8]);
      expect(sized).toEqual(inline()[1]);
    });

    // The default is already written into the rule as a fallback, so the call
    // has nothing to carry and the key travels on its own.
    it('leaves a call that only takes its default as a bare key', () => {
      expect(parent()[2]).toEqual(inline()[2]);
    });

    it('lets the dynamic value win over a base that sets the same property', () => {
      const [tone, , , merged] = parent();
      const cssVar = Object.keys(tone.style)[0];
      expect(merged.className).toBe(
        norm(classesOf(deepMerge(BASE, { backgroundColor: `var(${cssVar})` }))),
      );
      expect(merged.style).toEqual(tone.style);
    });

    it('falls back to the base alone when the prop is left out', () => {
      const merged = shape(hostElement(load(MERGED).Merged({}))?.props);
      expect(merged.className).toBe(classesOf(BASE));
      expect(merged.style).toEqual({});
    });

    // Not a typedcss requirement: css.props returns the style beside the class, so a dynamic key spread through it keeps its values.
    it.skip('is rejected on css.use(), which has no element to hold the values', async () => {
      await expect(run(USED)).rejects.toThrow(
        /css\.use\(\) returns only a class name/,
      );
    });

    // typedcss's counterpart: css.props spreads the values with the class.
    it('keeps the values of a dynamic key spread through css.props', () => {
      const children = parent();
      expect(children[4]).toEqual(children[0]);
    });

    // Only the branch that needs values becomes a pair; the readable one stays
    // the key it always was.
    it('replaces each branch of a conditional call site on its own', () => {
      expect(Object.values(parent(true)[7].style)).toEqual(['red']);
      expect(parent(false)[7]).toEqual({
        className: classesOf(BASE),
        style: {},
      });
    });

    it('withholds the values with the class when the child gates the prop', () => {
      const tone = load(STYLES).styles.tone('red');
      const gated = (on: boolean) =>
        shape(hostElement(load(GATED).Gated({ on, styleArray: tone }))?.props);
      expect(Object.values(gated(true).style)).toEqual(['red']);
      expect(gated(false)).toEqual({ className: '', style: {} });
    });

    // A parameter the body never reads produces no custom property, so the
    // style is just a class name.
    it('leaves a parameter that reaches no declaration as a bare key', async () => {
      expect(parent()[6]).toEqual({
        className: classesOf({ color: 'olive' }),
        style: {},
      });
      await expect(run(USED_PLAIN)).resolves.toContain('css.props(plain)');
    });

    // Not a typedcss requirement yet: typedcss does not read an imported function key in sx at build time, and the runtime skips an uncalled one.
    it.skip('rejects an uncalled dynamic function in a style prop array', async () => {
      await expect(run(UNREADABLE)).rejects.toThrow(
        'unsupported style expression',
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component.
    it.skip('is still rejected when passed on to another component', async () => {
      await expect(run(RELAY)).rejects.toThrow(/is never applied/);
    });

    // typedcss's counterpart: the relayed dynamic style arrives with its values.
    it('passes a relayed dynamic style on with its values', () => {
      const children = parent();
      expect(children[5]).toEqual(children[0]);
    });
  });
});
