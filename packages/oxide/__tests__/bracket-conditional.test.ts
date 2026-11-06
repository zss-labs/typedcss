import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP, renderClass } from './implementations';
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

const s = css.create({
  p1: { color: 'green' },
  p3: { color: 'teal' },
});

${body}
`;

  const run = async (body: string): Promise<string> => {
    const result = await transformSource(env(wrap(body), `${DIR}/fixture.tsx`));
    return typeof result === 'string' ? result : (result?.code ?? '');
  };

  // Bracket access with a literal key must resolve inside a conditional exactly
  // as `.key` does. It used to collapse to an empty className with no error.
  describe('transform: bracket access inside conditionals', () => {
    it('keeps both branches of a ternary', async () => {
      const out = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={on ? s['p1'] : s['p3']} />;`,
      );
      expect(out).toContain('x3git8yv');
      expect(out).toContain('xxcejlqg');
    });

    it('matches the dot-access output for the same ternary', async () => {
      const bracket = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={on ? s['p1'] : s['p3']} />;`,
      );
      const dot = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={on ? s.p1 : s.p3} />;`,
      );
      // typedcss keeps the access as written, so the two agree on what renders.
      for (const on of [true, false]) {
        expect(renderClass(bracket, { on })).toBe(renderClass(dot, { on }));
      }
    });

    it('keeps the right-hand side of a logical &&', async () => {
      const out = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={on && s['p1']} />;`,
      );
      expect(out).toContain('x3git8yv');
    });

    it('keeps a bracket branch nested in an array', async () => {
      const out = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={[s.p3, on && s['p1']]} />;`,
      );
      expect(out).toContain('x3git8yv');
      expect(out).toContain('xxcejlqg');
    });

    // The branches of a condition are mutually exclusive, so a group under one
    // stays a single lookup: the condition folds into the key expression and the
    // slot no key claims carries whatever the other branch contributes.
    it('folds an outer ternary into the key of a non-literal bracket', async () => {
      const out = await run(
        `export const A = ({ on, k }: { on: boolean; k: 'p1' | 'p3' }) => <div sx={on ? s[k] : s['p3']} />;`,
      );
      // typedcss picks at runtime, so the table Plumeria folds is checked by rendering.
      expect(renderClass(out, { on: true, k: 'p1' })).toBe('x3git8yv');
      expect(renderClass(out, { on: true, k: 'p3' })).toBe('xxcejlqg');
      expect(renderClass(out, { on: false, k: 'p1' })).toBe('xxcejlqg');
    });

    it('folds an outer && into the key of a non-literal bracket', async () => {
      const out = await run(
        `export const A = ({ on, k }: { on: boolean; k: 'p1' | 'p3' }) => <div sx={on && s[k]} />;`,
      );
      expect(renderClass(out, { on: true, k: 'p1' })).toBe('x3git8yv');
      expect(renderClass(out, { on: true, k: 'p3' })).toBe('xxcejlqg');
      expect(renderClass(out, { on: false, k: 'p1' })).toBe('');
    });

    it('compiles the same intent with the condition inside the brackets', async () => {
      const out = await run(
        `export const A = ({ on, k }: { on: boolean; k: 'p1' | 'p3' }) => <div sx={s[on ? k : 'p3']} />;`,
      );
      expect(out).toContain('x3git8yv');
      expect(out).toContain('xxcejlqg');
    });

    it('keeps a bracket branch mixed with dot access', async () => {
      const out = await run(
        `export const A = ({ on }: { on: boolean }) => <div sx={on ? s['p1'] : s.p3} />;`,
      );
      expect(out).toContain('x3git8yv');
      expect(out).toContain('xxcejlqg');
    });

    it('still compiles a non-literal key outside any condition', async () => {
      const out = await run(
        `export const A = ({ k }: { k: 'p1' | 'p3' }) => <div sx={s[k]} />;`,
      );
      expect(out).toContain('x3git8yv');
      expect(out).toContain('xxcejlqg');
    });
  });
});
