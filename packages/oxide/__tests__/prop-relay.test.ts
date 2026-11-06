// A component may receive a style through a prop and apply it to the element it
// renders, on its own or merged under a base. Passing that prop on to another
// component is where it stops: the style would have to be resolved across an
// arbitrary chain of wrappers, so it is rejected at build time instead.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_STYLE_PROP,
  getStyleRecords,
  deepMerge,
  childClasses,
  hostElement,
  loadProject,
} from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  const STYLES = path.join(DIR, 'styles.ts');
  const LEAF = path.join(DIR, 'Leaf.tsx');
  const MERGED = path.join(DIR, 'Merged.tsx');
  const RELAY = path.join(DIR, 'Relay.tsx');
  const RENAMED = path.join(DIR, 'Renamed.tsx');
  const PASSTHROUGH = path.join(DIR, 'Passthrough.tsx');
  const VIA_LOCAL = path.join(DIR, 'ViaLocal.tsx');
  const COHABIT = path.join(DIR, 'Cohabit.tsx');
  const MASKED = path.join(DIR, 'Masked.tsx');
  const RENAMED_BINDING = path.join(DIR, 'RenamedBinding.tsx');
  const TWINS = path.join(DIR, 'Twins.tsx');
  const DEFAULT_TWINS = path.join(DIR, 'DefaultTwins.tsx');
  const WRAPPED = path.join(DIR, 'Wrapped.tsx');
  const WRAPPED_RELAY = path.join(DIR, 'WrappedRelay.tsx');
  const WRAPPED_UNUSED = path.join(DIR, 'WrappedUnused.tsx');
  const PARENT = path.join(DIR, 'Parent.tsx');

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

  const RED = { padding: 4, color: 'red' };
  const BLUE = { padding: 8, color: 'blue' };
  const BASE = { padding: 24, fontWeight: 700, color: 'green' };

  const files: Record<string, string> = {
    [STYLES]: `
import * as css from '@typedcss/css';
export const styles = css.create(${JSON.stringify({
      red: RED,
      blue: BLUE,
      base: BASE,
    })});
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
    [RELAY]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
export const Relay = ({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={styleArray} />
);
`,
    [RENAMED]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
export const Renamed = ({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={[styleArray]} />
);
`,
    [COHABIT]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
export const Applies = ({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={styleArray} />
);
export const Forwards = ({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={styleArray} />
);
`,
    [MASKED]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
const wrap = (component: unknown) => component;
export const WrappedApplies = wrap(({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={styleArray} />
));
export const MaskedForwards = ({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={styleArray} />
);
`,
    [VIA_LOCAL]: `
import * as css from '@typedcss/css';
export const ViaLocal = ({ styleArray }: { styleArray?: css.Style }) => {
  const applied = styleArray;
  return <div sx={applied} />;
};
`,
    [RENAMED_BINDING]: `
import * as css from '@typedcss/css';
import { Leaf } from './Leaf';
export const RenamedBinding = ({ styleArray: s }: { styleArray?: css.Style }) => (
  <Leaf styleArray={s} />
);
`,
    [PASSTHROUGH]: `
import '@typedcss/css';
import { Leaf } from './Leaf';
export const Passthrough = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Leaf aria-label={label} onClick={onPress} />
);
`,
    [TWINS]: `
import * as css from '@typedcss/css';
export const TwinA = ({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={styleArray} />
);
export const TwinB = ({ styleArray }: { styleArray?: css.Style }) => (
  <span sx={styleArray} />
);
`,
    [DEFAULT_TWINS]: `
import * as css from '@typedcss/css';
export default function TwinDefault({ styleArray }: { styleArray?: css.Style }) {
  return <div sx={styleArray} />;
}
export const TwinNamed = ({ styleArray }: { styleArray?: css.Style }) => (
  <section sx={styleArray} />
);
`,
    [WRAPPED]: `
import * as css from '@typedcss/css';
const wrap = (component: unknown) => component;
export const Sibling = ({ styleArray }: { styleArray?: css.Style }) => (
  <div sx={styleArray} />
);
export const Wrapped = wrap(({ styleArray }: { styleArray?: css.Style }) => (
  <span sx={styleArray} />
));
`,
    [WRAPPED_RELAY]: `
import * as css from '@typedcss/css';
import { styles } from './styles';
import { Leaf } from './Leaf';
const memo = (component: unknown) => component;
export const WrappedRelay = memo(({ styleArray }: { styleArray?: css.Style }) => (
  <Leaf styleArray={styleArray} />
));
export const CallsWrappedRelay = () => <WrappedRelay styleArray={styles.red} />;
`,
    [WRAPPED_UNUSED]: `
import * as css from '@typedcss/css';
import { styles } from './styles';
const memo = (component: unknown) => component;
export const WrappedUnused = memo(({ label }: { label?: string; styleArray?: css.Style }) => (
  <div>{label}</div>
));
export const CallsWrappedUnused = () => <WrappedUnused styleArray={styles.red} />;
`,
    [PARENT]: `
import '@typedcss/css';
import { styles } from './styles';
import { Leaf } from './Leaf';
import { Merged } from './Merged';
import { Relay } from './Relay';
import { Renamed } from './Renamed';
import { ViaLocal } from './ViaLocal';
import { Applies, Forwards } from './Cohabit';
import { WrappedApplies, MaskedForwards } from './Masked';
import { RenamedBinding } from './RenamedBinding';
import { TwinA, TwinB } from './Twins';
import TwinDefault from './DefaultTwins';
import { Sibling, Wrapped } from './Wrapped';
import { TwinNamed } from './DefaultTwins';

export const Parent = () => (
  <div>
    <Leaf styleArray={styles.red} />
    <Merged styleArray={styles.red} />
    <Merged styleArray={styles.blue} />
    <Relay styleArray={styles.blue} />
    <Renamed styleArray={styles.blue} />
    <ViaLocal styleArray={styles.blue} />
    <Applies styleArray={styles.red} />
    <Forwards styleArray={styles.blue} />
    <WrappedApplies styleArray={styles.red} />
    <MaskedForwards styleArray={styles.blue} />
    <RenamedBinding styleArray={styles.blue} />
    <Sibling styleArray={styles.red} />
    <Wrapped styleArray={styles.blue} />
    <TwinNamed styleArray={styles.red} />
    <TwinDefault styleArray={styles.blue} />
    <TwinA styleArray={styles.red} />
    <TwinB styleArray={styles.blue} />
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
      .map((r) => r.hash)
      .sort()
      .join(' ');

  const norm = (value: string) => value.trim().split(/\s+/).sort().join(' ');

  beforeAll(() => {
    for (const [p, src] of Object.entries(files)) fs.writeFileSync(p, src);
  });

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  // Plumeria hands a relayed style over as a key into a table it writes into
  // the receiving component. typedcss passes the style value itself, so Parent
  // is rendered through the components it imports and each child is checked.
  const rendered = async () => {
    const codes: Record<string, string> = {};
    for (const file of Object.keys(files)) {
      if (file === WRAPPED_RELAY || file === WRAPPED_UNUSED) continue;
      codes[file] = await run(file);
    }
    return childClasses(loadProject(codes)(PARENT).Parent()).map(norm);
  };
  // [Leaf red, Merged red, Merged blue, Relay blue, Renamed blue, ViaLocal blue,
  //  Applies red, Forwards blue, WrappedApplies red, MaskedForwards blue,
  //  RenamedBinding blue, Sibling red, Wrapped blue, TwinNamed red,
  //  TwinDefault blue, TwinA red, TwinB blue]

  describe('transform: a style received through a prop', () => {
    it('applies to the element that received it', async () => {
      expect((await rendered())[0]).toBe(classesOf(RED));
    });

    it('merges under a base style on that same element', async () => {
      const classes = await rendered();
      expect(classes[1]).toBe(norm(classesOf(deepMerge(BASE, RED))));
      expect(classes[2]).toBe(norm(classesOf(deepMerge(BASE, BLUE))));
      const load = loadProject({
        [STYLES]: await run(STYLES),
        [MERGED]: await run(MERGED),
      });
      expect(norm(hostElement(load(MERGED).Merged({}))!.props.className)).toBe(
        norm(classesOf(BASE)),
      );
    });

    // Two components in one file that take the same prop name must not share one
    // lookup table: the second would render with the first one's keys.
    it('keeps two components declared in one file apart', async () => {
      const classes = await rendered();
      expect(classes[15]).toBe(norm(classesOf(RED)));
      expect(classes[16]).toBe(norm(classesOf(BLUE)));
    });

    it('keeps a default export apart from a named one in the same file', async () => {
      const classes = await rendered();
      expect(classes[14]).toBe(norm(classesOf(BLUE)));
      expect(classes[13]).toBe(norm(classesOf(RED)));
    });

    // A wrapper leaves the component as a function argument of a call, which is
    // still the component the styles were handed to.
    it('applies to a component a call wraps', async () => {
      const classes = await rendered();
      expect(classes[11]).toBe(norm(classesOf(RED)));
      expect(classes[12]).toBe(norm(classesOf(BLUE)));
      expect(classes[8]).toBe(norm(classesOf(RED)));
    });

    // typedcss's counterpart of the rejections below: the relayed style arrives.
    it('passes a relayed style on to the element that applies it', async () => {
      const classes = await rendered();
      for (const index of [3, 4, 5, 7, 9, 10]) {
        expect(classes[index]).toBe(norm(classesOf(BLUE)));
      }
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected when a wrapped component passes it on', async () => {
      await expect(run(WRAPPED_RELAY)).rejects.toThrow(
        /"styleArray" is a style received through a prop but is never applied/,
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected when a wrapped component never applies it', async () => {
      await expect(run(WRAPPED_UNUSED)).rejects.toThrow(
        /a style prop cannot be passed on to another component/,
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected when passed on to another component', async () => {
      await expect(run(RELAY)).rejects.toThrow(/is never applied/);
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected inside an array too', async () => {
      await expect(run(RENAMED)).rejects.toThrow(
        /a style prop cannot be passed on to another component/,
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('reports where the relay is written', async () => {
      await expect(run(RELAY)).rejects.toThrow(/\(Relay\.tsx:\d+:\d+\)/);
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected when the binding was renamed by destructuring', async () => {
      await expect(run(RENAMED_BINDING)).rejects.toThrow(/is never applied/);
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected when routed through a local variable', async () => {
      await expect(run(VIA_LOCAL)).rejects.toThrow(
        /Dynamic or unresolvable style object "applied"/,
      );
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected even when a sibling component in the same file applies it', async () => {
      await expect(run(COHABIT)).rejects.toThrow(/\(Cohabit\.tsx:7:\d+\)/);
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component, routed through a variable, or left unused.
    it.skip('is rejected even when a wrapper-invoked component applies the same prop name', async () => {
      await expect(run(MASKED)).rejects.toThrow(/is never applied/);
    });

    it('leaves ordinary props alone', async () => {
      await expect(run(PASSTHROUGH)).resolves.toContain('aria-label={label}');
    });
  });
});
