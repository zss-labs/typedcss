import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_STYLE_PROP,
  evaluateModule,
  hostElement,
  loadProject,
} from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  const IMPORTED_STYLES = path.join(DIR, 'imported.styles.ts');

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
  fs.writeFileSync(
    IMPORTED_STYLES,
    `import * as css from '@typedcss/css';
export const importedStyles = css.create({
  tone: (color: string) => ({ color, fontWeight: 700 }),
});
`,
  );

  const run = (
    code: string,
    name: string,
  ): Promise<{ code: string; sheets: string[] }> => {
    const file = path.join(DIR, name);
    fs.writeFileSync(file, code);
    return transformSource(env(code, file)).then((result) => ({
      code: result.code,
      sheets: [compileCSS({ include: [name], exclude: [], cwd: DIR })],
    }));
  };

  // A file left off the disk has no entry in the scan, so a component it renders
  // is read without knowing which props carry a style.
  const runUnscanned = (
    code: string,
    name: string,
  ): Promise<{ code: string }> =>
    transformSource(env(code, path.join(DIR, name)));

  const header = `import * as css from '@typedcss/css';
import { Box } from './box';
const s = css.create({ stat: { color: 'red' }, palette: (color: string) => ({ color }) });
`;

  // typedcss merges at runtime, so each element is read off the rendered tree.
  const render = (
    code: string,
    file: string,
    name: string,
    props: Record<string, unknown> = {},
  ) => {
    const found: { className?: string; style: Record<string, unknown> }[] = [];
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (
        typeof node.type === 'string' &&
        ('className' in node.props || 'style' in node.props)
      )
        found.push({
          className: node.props.className,
          style: node.props.style ?? {},
        });
      walk(node.props?.children);
    };
    walk(evaluateModule(code, path.join(DIR, file))[name](props));
    return found;
  };
  const definedVars = (style: Record<string, unknown> = {}) =>
    Object.fromEntries(
      Object.entries(style).filter(
        ([key, value]) => key.startsWith('--') && value !== undefined,
      ),
    );

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  describe('dynamic function keys', () => {
    const defaults = `import * as css from '@typedcss/css';
const d = css.create({
  tinted: (c = 'teal') => ({ color: c }),
  plain: () => ({ color: 'olive' }),
  toned: ({ tone = 'navy' }) => ({ backgroundColor: tone }),
});
`;

    it('applies a parameter default without an inline style', async () => {
      const { code } = await run(
        defaults + 'export const A = () => <div sx={d.tinted()} />;',
        'default-omitted.tsx',
      );
      const [el] = render(code, 'default-omitted.tsx', 'A');
      expect(el.className).toMatch(/^[a-z0-9]+$/);
      expect(definedVars(el.style)).toEqual({});
    });

    // The default lives in the sheet, so overriding it must reuse the class and
    // only add the variable.
    it('keeps the same class when a defaulted parameter is given a value', async () => {
      const omitted = await run(
        defaults + 'export const A = () => <div sx={d.tinted()} />;',
        'default-a.tsx',
      );
      const given = await run(
        defaults + "export const A = () => <div sx={d.tinted('blue')} />;",
        'default-b.tsx',
      );
      const [a] = render(omitted.code, 'default-a.tsx', 'A');
      const [b] = render(given.code, 'default-b.tsx', 'A');
      expect(b.className).toBe(a.className);
      expect(Object.values(definedVars(b.style))).toEqual(['blue']);
    });

    it('applies a destructured default when the key is omitted', async () => {
      const { code } = await run(
        defaults + 'export const A = () => <div sx={d.toned({})} />;',
        'default-named.tsx',
      );
      const [el] = render(code, 'default-named.tsx', 'A');
      expect(el.className).toMatch(/^[a-z0-9]+$/);
      expect(definedVars(el.style)).toEqual({});
    });

    it('applies a destructured default when the call takes no argument', async () => {
      const omitted = await run(
        defaults + 'export const A = () => <div sx={d.toned()} />;',
        'default-named-omitted.tsx',
      );
      const empty = await run(
        defaults + 'export const A = () => <div sx={d.toned({})} />;',
        'default-named-empty.tsx',
      );
      const [omittedEl] = render(
        omitted.code,
        'default-named-omitted.tsx',
        'A',
      );
      const [emptyEl] = render(empty.code, 'default-named-empty.tsx', 'A');
      expect(omittedEl.className).toBe(emptyEl.className);
      expect(definedVars(omittedEl.style)).toEqual({});
    });

    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('rejects a call with no argument when a destructured parameter has no default', async () => {
      await expect(
        run(
          `import * as css from '@typedcss/css';
const s = css.create({ bare: ({ tone }: { tone: string }) => ({ backgroundColor: tone }) });
export const B = () => <div sx={s.bare()} />;`,
          'named-omitted-unset.tsx',
        ),
      ).rejects.toThrow('leaves "tone" unset');
    });

    it('resolves a call on a style function that takes no parameter', async () => {
      const { code } = await run(
        defaults + 'export const A = () => <div sx={d.plain()} />;',
        'default-none.tsx',
      );
      const [el] = render(code, 'default-none.tsx', 'A');
      expect(el.className).toMatch(/^[a-z0-9]+$/);
      expect(definedVars(el.style)).toEqual({});
    });

    it('resolves an imported function key', async () => {
      const file = path.join(DIR, 'imported-consumer.tsx');
      const source = `import '@typedcss/css';
import { importedStyles } from './imported.styles';
export const Imported = (p: any) => <p sx={importedStyles.tone(p.color)} />;`;
      fs.writeFileSync(file, source);

      const { code } = await transformSource(env(source, file));
      const library = await transformSource(
        env(fs.readFileSync(IMPORTED_STYLES, 'utf8'), IMPORTED_STYLES),
      );
      const el = hostElement(
        loadProject({ [file]: code, [IMPORTED_STYLES]: library.code })(
          file,
        ).Imported({ color: 'red' }),
      )!;

      expect(el.props.className).toMatch(/^[a-z0-9]+ [a-z0-9]+$/);
      const vars = definedVars(el.props.style);
      expect(Object.keys(vars)).toEqual([
        expect.stringMatching(/^--.+-color$/),
      ]);
      expect(Object.values(vars)).toEqual(['red']);
    });

    describe('a function key resolves its names where it was written', () => {
      // An imported call has to land on the same classes the identical
      // declaration produces inline, or the scope the body reads is the
      // consumer's rather than the one it was written in.
      const classesOf = (code: string) =>
        code.match(/className=\{"([^"]*)"\}/)?.[1];

      const compare = async (declaration: string, leadIn = '') => {
        const stylesFile = path.join(DIR, 'scoped.styles.ts');
        fs.writeFileSync(
          stylesFile,
          `import * as css from '@typedcss/css';
${leadIn}export const scoped = css.create(${declaration});
`,
        );
        const consumerFile = path.join(DIR, 'scoped-consumer.tsx');
        const consumer = `import '@typedcss/css';
import { scoped } from './scoped.styles';
export const A = (p: any) => <div sx={scoped.tone(p.c)} />;`;
        fs.writeFileSync(consumerFile, consumer);
        const imported = await transformSource(env(consumer, consumerFile));

        const inline = await run(
          `import * as css from '@typedcss/css';
${leadIn}const scoped = css.create(${declaration});
export const A = (p: any) => <div sx={scoped.tone(p.c)} />;`,
          'scoped-inline.tsx',
        );

        return [classesOf(imported.code), classesOf(inline.code)];
      };

      it('resolves a const declared in the defining file', async () => {
        const [imported, inline] = await compare(
          `{ tone: (color: string) => ({ color, fontWeight: weight }) }`,
          'const weight = 700;\n',
        );
        expect(imported).toBe(inline);
      });

      it('resolves a spread of a const declared in the defining file', async () => {
        const [imported, inline] = await compare(
          `{ tone: (color: string) => ({ color, ...base }) }`,
          'const base = { fontWeight: 700 };\n',
        );
        expect(imported).toBe(inline);
      });

      it('resolves a const the parameter shares an expression with', async () => {
        const [imported, inline] = await compare(
          '{ tone: (value: string) => ({ padding: `${value} ${gap}` }) }',
          "const gap = '4px';\n",
        );
        expect(imported).toBe(inline);
      });

      it('resolves a defining-file const behind a named parameter', async () => {
        const stylesFile = path.join(DIR, 'named.styles.ts');
        fs.writeFileSync(
          stylesFile,
          `import * as css from '@typedcss/css';
const weight = 700;
export const named = css.create({
  tone: ({ color }: { color: string }) => ({ color, fontWeight: weight }),
});
`,
        );
        const consumerFile = path.join(DIR, 'named-consumer.tsx');
        const consumer = `import '@typedcss/css';
import { named } from './named.styles';
export const A = (p: any) => <div sx={named.tone({ color: p.c })} />;`;
        fs.writeFileSync(consumerFile, consumer);
        const { code } = await transformSource(env(consumer, consumerFile));

        const inline = await run(
          `import * as css from '@typedcss/css';
const weight = 700;
const named = css.create({
  tone: ({ color }: { color: string }) => ({ color, fontWeight: weight }),
});
export const A = (p: any) => <div sx={named.tone({ color: p.c })} />;`,
          'named-inline.tsx',
        );

        expect(classesOf(code)).toBe(classesOf(inline.code));
      });
    });

    it('resolves a prop argument into a class name and a CSS variable', async () => {
      const { code } = await run(
        header + `export const A = (p: any) => <div sx={s.palette(p.c)} />;`,
        'a.tsx',
      );
      const [el] = render(code, 'a.tsx', 'A', { c: 'red' });
      expect(el.className).toMatch(/^[a-z0-9]+$/);
      expect(Object.keys(definedVars(el.style))).toEqual([
        expect.stringMatching(/^--.+-color$/),
      ]);
      expect(Object.values(definedVars(el.style))).toEqual(['red']);
      const [numeric] = render(code, 'a.tsx', 'A', { c: 3 });
      expect(Object.values(definedVars(numeric.style))).toEqual(['3px']);
    });

    it('names the variable after the declaration it lands in', async () => {
      // Two creates may share a key name and a parameter name. The variable
      // names must still differ, or the later entry in the inline style object
      // silently overwrites the earlier one.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const a = css.create({ palette: (color: string) => ({ backgroundColor: color }) });
const b = css.create({ palette: (color: string) => ({ borderColor: color }) });
export const B = (p: any) => <div sx={[a.palette(p.x), b.palette(p.y)]} />;`,
        'b.tsx',
      );
      expect(code).toContain('"--xav007xm-color"');
      expect(code).toContain('"--xcf1maiq-color"');
    });

    it('keeps two files apart when both name the create the same', async () => {
      // The name is derived from the resolved body, so it does not depend on the
      // local identifier and cannot be shared by unrelated declarations.
      const one = await run(
        `import * as css from '@typedcss/css';
const styles = css.create({ box: (w: number) => ({ width: w }) });
export const C = (p: any) => <div sx={styles.box(p.w)} />;`,
        'c.tsx',
      );
      const two = await run(
        `import * as css from '@typedcss/css';
const styles = css.create({ box: (w: number) => ({ height: w }) });
export const D = (p: any) => <div sx={styles.box(p.w)} />;`,
        'd.tsx',
      );
      const nameOf = (code: string) => code.match(/"(--[^"]+-w)"/)?.[1];
      expect(nameOf(one.code)).toBeDefined();
      expect(nameOf(one.code)).not.toBe(nameOf(two.code));
    });

    it('sets the variable for a parameter that only appears under nesting', async () => {
      // The rule is emitted whatever the nesting is, so an inline variable that
      // only covers top-level declarations leaves the rule reading nothing.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({
  link: (base: string, hovered: string) => ({ color: base, ':hover': { color: hovered } }),
  deep: (size: number) => ({ '@media (min-width: 600px)': { ':hover': { fontSize: size } } }),
});
export const E = (p: any) => (<div><a sx={s.link(p.b, p.h)} /><i sx={s.deep(p.s)} /></div>);`,
        'nested.tsx',
      );
      const [a, i] = render(code, 'nested.tsx', 'E', { b: 'red', h: 2, s: 3 });
      expect(Object.values(definedVars(a.style)).sort()).toEqual([
        '2px',
        'red',
      ]);
      expect(Object.values(definedVars(i.style))).toEqual(['3px']);
    });

    it('keeps a unitless nested property free of the px fallback', async () => {
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ fade: (o: number) => ({ ':hover': { opacity: o } }) });
export const F = (p: any) => <div sx={s.fade(p.o)} />;`,
        'unitless.tsx',
      );
      const [el] = render(code, 'unitless.tsx', 'F', { o: 0.5 });
      expect(Object.values(definedVars(el.style)).map(String)).toEqual(['0.5']);
    });

    it('keeps a multi-word unitless property free of the px fallback', async () => {
      // The unitless list is kebab-case at the source, so a property that reads
      // the same either way (opacity) hides the ones that do not.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ grow: (n: number) => ({ flexGrow: n }), weight: (n: number) => ({ fontWeight: n }) });
export const F2 = (p: any) => (<div><i sx={s.grow(1)} /><b sx={s.weight(p.w)} /></div>);`,
        'unitless-multiword.tsx',
      );
      const [i, b] = render(code, 'unitless-multiword.tsx', 'F2', { w: 700 });
      expect(Object.values(definedVars(i.style)).map(String)).toEqual(['1']);
      expect(Object.values(definedVars(b.style)).map(String)).toEqual(['700']);
    });

    it('leaves a custom property number alone whichever way it is written', async () => {
      // A custom property carries no unit rule, and the literal and the runtime
      // argument have to agree on that.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ gap: (n: number) => ({ '--gap': n, gap: 'var(--gap)' }) });
export const F3 = (p: any) => (<div><i sx={s.gap(4)} /><b sx={s.gap(p.n)} /></div>);`,
        'custom-prop.tsx',
      );
      const [i, b] = render(code, 'custom-prop.tsx', 'F3', { n: 4 });
      expect(Object.values(definedVars(i.style)).map(String)).toEqual(['4']);
      expect(Object.values(definedVars(b.style)).map(String)).toEqual(['4']);
    });

    it('splits the variable when the parameter lands in both unit rules', async () => {
      // The element sets the variable once, so padding and z-index cannot read
      // the same one: 4px and 4 are both needed.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ units: (n: number) => ({ padding: n, zIndex: n }) });
export const U = (p: any) => <div sx={s.units(p.n)} />;`,
        'unit-split.tsx',
      );
      const [el] = render(code, 'unit-split.tsx', 'U', { n: 4 });
      const vars = definedVars(el.style);
      const zIndex = Object.keys(vars).find((key) => key.endsWith('-z-index'))!;
      expect(String(vars[zIndex])).toBe('4');
      expect(
        Object.entries(vars)
          .filter(([key]) => key !== zIndex)
          .map(([, v]) => v),
      ).toEqual(['4px']);
    });

    it('keeps one variable when the declarations share a unit rule', async () => {
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ same: (c: string) => ({ color: c, borderColor: c }) });
export const S = (p: any) => <div sx={s.same(p.c)} />;`,
        'unit-same.tsx',
      );
      expect(code.match(/"--[^"]+"/g)).toHaveLength(1);
    });

    it('gives the variable of a call under a condition the same reach as its class', async () => {
      const { code } = await run(
        header +
          `export const G = (p: any) => (<div><i sx={p.on && s.palette(p.c)} /><b sx={p.on ? s.palette(p.a) : s.palette(p.b)} /></div>);`,
        'conditional.tsx',
      );
      const props = { c: 'red', a: 'teal', b: 'navy' };
      const [onI, onB] = render(code, 'conditional.tsx', 'G', {
        ...props,
        on: true,
      });
      expect(Object.values(definedVars(onI.style))).toEqual(['red']);
      expect(Object.values(definedVars(onB.style))).toEqual(['teal']);
      const off = evaluateModule(code, path.join(DIR, 'conditional.tsx')).G({
        ...props,
        on: false,
      });
      const [offI, offB] = off.props.children.map((child: any) => child.props);
      expect(definedVars(offI.style)).toEqual({});
      expect(Object.values(definedVars(offB.style))).toEqual(['navy']);
    });

    it('takes named parameters from a destructured signature', async () => {
      // The call names the parameters, and a renamed binding is read under the
      // name the body uses, not the one the caller wrote.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({
  named: ({ color, size }: { color: string; size: number }) => ({ color, fontSize: size }),
  renamed: ({ tone: t }: { tone: string }) => ({ backgroundColor: t }),
});
export const H = (p: any) => (<div>
  <i sx={s.named({ color: p.c, size: 12 })} />
  <b sx={s.renamed({ tone: p.t })} />
</div>);`,
        'named.tsx',
      );
      const [i, b] = render(code, 'named.tsx', 'H', { c: 'red', t: 'blue' });
      expect(Object.values(definedVars(i.style)).sort()).toEqual([
        '12px',
        'red',
      ]);
      expect(Object.entries(definedVars(b.style))).toEqual([
        [expect.stringMatching(/-t$/), 'blue'],
      ]);
    });

    it('folds a named value only when it is written out in full', async () => {
      // typedcss sets every call-site value as a variable, so what matters is
      // that each one, the interpolated one included, arrives whole.
      const { code } = await run(
        `import * as css from '@typedcss/css';
const GAP = 'blue';
const s = css.create({ tint: ({ color }: { color: string }) => ({ backgroundColor: color }) });
export const K = (p: any) => (<div>
  <i sx={s.tint({ color: "red" })} />
  <b sx={s.tint({ color: GAP })} />
  <u sx={s.tint({ color: \`rgb(\${p.r} 0 0)\` })} />
</div>);`,
        'folding.tsx',
      );
      const [i, b, u] = render(code, 'folding.tsx', 'K', { r: 10 });
      expect(Object.values(definedVars(i.style))).toEqual(['red']);
      expect(Object.values(definedVars(b.style))).toEqual(['blue']);
      expect(Object.values(definedVars(u.style))).toEqual(['rgb(10 0 0)']);
    });

    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('rejects a named call that leaves a parameter unset', async () => {
      await expect(
        run(
          `import * as css from '@typedcss/css';
const s = css.create({ named: ({ color, size }: { color: string; size: number }) => ({ color, fontSize: size }) });
export const I = (p: any) => <div sx={s.named({ color: p.c })} />;`,
          'unset.tsx',
        ),
      ).rejects.toThrow('leaves "size" unset');
    });

    // Not a typedcss requirement: call-site arguments of a function key are not read at build time.
    it.skip('rejects a positional call to a named signature', async () => {
      await expect(
        run(
          `import * as css from '@typedcss/css';
const s = css.create({ named: ({ color }: { color: string }) => ({ color }) });
export const J = (p: any) => <div sx={s.named(p.c)} />;`,
          'positional.tsx',
        ),
      ).rejects.toThrow('takes one object argument');
    });

    // Not a typedcss requirement: typedcss merges at runtime, so a style prop can be passed on to another component.
    it.skip('rejects a call handed to a component prop instead of emitting a broken lookup', async () => {
      // The create call becomes a plain object holding only the static keys, so
      // leaving the call in place would throw "palette is not a function".
      await expect(
        runUnscanned(
          header +
            `export const C = (p: any) => <Box styleArray={s.palette(p.c)} />;`,
          'c.tsx',
        ),
      ).rejects.toThrow(
        '[typedcss] s.palette(p.c) is only supported in the sx prop.',
      );
    });

    // Not a typedcss requirement: the definition's variable is kept, so the function key stays callable anywhere.
    it.skip('rejects a call whose result is never handed to the style prop', async () => {
      await expect(
        run(
          header +
            `export const D = (p: any) => { s.palette(p.c); return <div sx={s.stat} />; };`,
          'd.tsx',
        ),
      ).rejects.toThrow('is only supported in the sx prop.');
    });

    // Not a typedcss requirement: the definition's variable is kept instead of writing its value in place.
    it.skip('keeps static keys usable through component props', async () => {
      const { code } = await runUnscanned(
        header + `export const E = () => <Box styleArray={s.stat} />;`,
        'e.tsx',
      );
      expect(code).toContain('styleArray={({"color":"xq96bg3w"})}');
    });
  });

  describe('a unit the declaration already spells out', () => {
    it('moves the unit into the value the element sets', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ fill: (pct: number) => ({ width: \`\${pct}%\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.fill(r)} />;`,
        'unit-percent.tsx',
      );
      expect(sheets.join('')).toMatch(/width: var\(--[a-z0-9-]+\);/);
      const [el] = render(code, 'unit-percent.tsx', 'A', { r: 40 });
      expect(Object.values(definedVars(el.style))).toEqual(['40%']);
    });

    it('moves a unit written as px the same way', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ box: (w: number) => ({ width: \`\${w}px\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.box(r)} />;`,
        'unit-px.tsx',
      );
      expect(sheets.join('')).toMatch(/width: var\(--[a-z0-9-]+\);/);
      const [el] = render(code, 'unit-px.tsx', 'A', { r: 40 });
      expect(Object.values(definedVars(el.style))).toEqual(['40px']);
    });

    it('moves a unit written inside calc', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ box: (w: number) => ({ width: \`calc(100% - \${w}px)\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.box(r)} />;`,
        'unit-calc-suffix.tsx',
      );
      expect(sheets.join('')).toMatch(
        /width: calc\(100% - var\(--[a-z0-9-]+\)\);/,
      );
      const [el] = render(code, 'unit-calc-suffix.tsx', 'A', { r: 40 });
      expect(Object.values(definedVars(el.style))).toEqual(['40px']);
    });

    it('still carries the unit when the declaration writes none', async () => {
      const bare = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ box: (w: number) => ({ width: w }) });
export const A = ({ r }: { r: number }) => <div sx={s.box(r)} />;`,
        'unit-bare.tsx',
      );
      const inCalc = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ box: (w: number) => ({ width: \`calc(\${w} * 2)\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.box(r)} />;`,
        'unit-calc-factor.tsx',
      );
      expect(bare.sheets.join('')).toMatch(/width: var\(--[a-z0-9-]+\);/);
      const [bareEl] = render(bare.code, 'unit-bare.tsx', 'A', { r: 40 });
      expect(Object.values(definedVars(bareEl.style))).toEqual(['40px']);
      const [calcEl] = render(inCalc.code, 'unit-calc-factor.tsx', 'A', {
        r: 40,
      });
      expect(Object.values(definedVars(calcEl.style))).toEqual(['40px']);
      expect(inCalc.sheets.join('')).toMatch(
        /width: calc\(var\(--[a-z0-9-]+\) \* 2\);/,
      );
    });

    it('writes the default into the sheet with the unit', async () => {
      const { sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ fill: (pct: number = 0) => ({ width: \`\${pct}%\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.fill(r)} />;`,
        'unit-default.tsx',
      );
      expect(sheets.join('')).toMatch(/width: var\(--[a-z0-9-]+, 0%\);/);
    });

    it('resolves the rating bar a benchmark lane reported as full width', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const styles = css.create({
  ratingFill: { height: '100%', backgroundColor: '#fbbf24' },
  fillW: (pct: number = 0) => ({ width: \`\${pct}%\` }),
});
export const Bar = ({ p }: { p: { rating: number } }) => (
  <div sx={[styles.ratingFill, styles.fillW((p.rating / 5) * 100)]} />
);`,
        'unit-rating-bar.tsx',
      );
      expect(sheets.join('')).toMatch(/width: var\(--[a-z0-9-]+, 0%\);/);
      const [el] = render(code, 'unit-rating-bar.tsx', 'Bar', {
        p: { rating: 4 },
      });
      expect(Object.values(definedVars(el.style))).toEqual(['80%']);
    });

    it('writes a literal argument with the unit', async () => {
      const { code } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ fill: (pct: number) => ({ width: \`\${pct}%\` }) });
export const A = () => <div sx={s.fill(40)} />;`,
        'unit-literal.tsx',
      );
      const [el] = render(code, 'unit-literal.tsx', 'A', {});
      expect(Object.values(definedVars(el.style))).toEqual(['40%']);
    });

    it('gives a parameter used in three units three variables', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({
  k: (n: number) => ({ width: \`\${n}px\`, margin: \`\${n}rem\`, translate: \`\${n}%\` }),
});
export const A = ({ r }: { r: number }) => <div sx={s.k(r)} />;`,
        'unit-three.tsx',
      );
      const css = sheets.join('');
      expect(css).toMatch(/width: var\(--[a-z0-9-]+\);/);
      expect(css).toMatch(/margin: var\(--[a-z0-9-]+-margin\);/);
      expect(css).toMatch(/translate: var\(--[a-z0-9-]+-translate\);/);
      const [el] = render(code, 'unit-three.tsx', 'A', { r: 2 });
      const vars = definedVars(el.style);
      expect(
        Object.entries(vars).find(([k]) => k.endsWith('-margin'))?.[1],
      ).toBe('2rem');
      expect(
        Object.entries(vars).find(([k]) => k.endsWith('-translate'))?.[1],
      ).toBe('2%');
      expect(Object.values(vars).sort()).toEqual(['2%', '2px', '2rem']);
    });

    it('gives two units in one declaration their own variables', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ k: (n: number) => ({ width: \`calc(\${n}px + \${n}%)\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.k(r)} />;`,
        'unit-two-in-one.tsx',
      );
      expect(sheets.join('')).toMatch(
        /width: calc\(var\(--[a-z0-9-]+\) \+ var\(--[a-z0-9-]+-width\)\);/,
      );
      const [el] = render(code, 'unit-two-in-one.tsx', 'A', { r: 2 });
      const vars = definedVars(el.style);
      expect(
        Object.entries(vars).find(([k]) => k.endsWith('-width'))?.[1],
      ).toBe('2%');
      expect(Object.values(vars).sort()).toEqual(['2%', '2px']);
    });

    it('splits one parameter that lands in declarations with different units', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ box: (w: number) => ({ width: w, marginTop: \`\${w}%\` }) });
export const A = ({ r }: { r: number }) => <div sx={s.box(r)} />;`,
        'unit-split.tsx',
      );
      const css = sheets.join('');
      expect(css).toMatch(/width: var\(--[a-z0-9-]+\);/);
      expect(css).toMatch(/margin-top: var\(--[a-z0-9-]+-margin-top\);/);
      const [el] = render(code, 'unit-split.tsx', 'A', { r: 2 });
      const vars = definedVars(el.style);
      expect(
        Object.entries(vars).find(([k]) => k.endsWith('-margin-top'))?.[1],
      ).toBe('2%');
      expect(Object.values(vars).sort()).toEqual(['2%', '2px']);
    });

    it('leaves a number inside a color or scale function without a unit', async () => {
      const { code, sheets } = await run(
        `import * as css from '@typedcss/css';
const s = css.create({ k: (h: number, d: number) => ({ color: \`hsl(\${h} 85% 72%)\`, transform: \`scaleX(\${d})\` }) });
export const A = ({ h, d }: { h: number; d: number }) => <div sx={s.k(h, d)} />;`,
        'unit-unitless-function.tsx',
      );
      const css = sheets.join('');
      expect(css).toMatch(/color: hsl\(var\(--[a-z0-9-]+\) 85% 72%\);/);
      expect(css).toMatch(/transform: scaleX\(var\(--[a-z0-9-]+\)\);/);
      const [el] = render(code, 'unit-unitless-function.tsx', 'A', {
        h: 200,
        d: 2,
      });
      expect(Object.values(definedVars(el.style)).map(String).sort()).toEqual([
        '2',
        '200',
      ]);
    });
  });
});
