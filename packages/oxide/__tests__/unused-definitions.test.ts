// css.keyframes, css.viewTransitionClass, css.positionTry and css.varType emit
// their CSS only when the name is used: in css.create, read at runtime by a
// file the build sees, or inside another emitted definition.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compileCSS } from './implementations';

const DEFINITIONS = `import * as css from '@typedcss/css';
export const spin = css.keyframes({ to: { rotate: '360deg' } });
export const fade = css.keyframes({ to: { opacity: 0.25 } });
export const slide = css.viewTransitionClass({ old: { opacity: 0.5 } });
export const above = css.positionTry({ positionArea: 'top' });
export const angle = css.varType({ syntax: '<angle>', initialValue: '0deg' });
export const turn = css.keyframes({ to: { [angle]: '360deg' } });
`;

let dir: string;

beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-unused-')),
  );
  fs.writeFileSync(path.join(dir, 'definitions.ts'), DEFINITIONS);
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const css = (app: string) => {
  fs.writeFileSync(path.join(dir, 'app.tsx'), app);
  return compileCSS({ cwd: dir, include: ['*.ts', '*.tsx'], exclude: [] });
};

it('emits nothing that nothing uses', () => {
  const sheet = css(`import * as css from '@typedcss/css';
const s = css.create({ a: { color: 'red' } });
export const A = () => <div sx={s.a} />;
`);
  expect(sheet).not.toContain('@keyframes');
  expect(sheet).not.toContain('view-transition');
  expect(sheet).not.toContain('@position-try');
  expect(sheet).not.toContain('@property');
});

it('emits what css.create uses, and what that one uses in turn', () => {
  const sheet = css(`import * as css from '@typedcss/css';
import { spin, turn } from './definitions';
const s = css.create({ a: { animationName: \`\${spin}, \${turn}\` } });
export const A = () => <div sx={s.a} />;
`);
  expect(sheet).toContain('rotate: 360deg');
  expect(sheet).not.toContain('opacity: 0.25');
  expect(sheet).toMatch(/@property --pr-\w+/);
});

it('emits what a file the build sees reads at runtime', () => {
  const sheet = css(`import * as css from '@typedcss/css';
import { ViewTransition } from 'react';
import * as d from './definitions';
import { fade } from './definitions';
const s = css.create({ a: { color: 'red' } });
export const A = () => (
  <ViewTransition enter={d.slide}>
    <div sx={s.a} style={{ animationName: fade, positionTryFallbacks: d.above }} />
  </ViewTransition>
);
`);
  expect(sheet).toContain('opacity: 0.25');
  expect(sheet).toContain('::view-transition-old(*.vt-');
  expect(sheet).toContain('@position-try');
  expect(sheet).not.toContain('rotate: 360deg');
});

it('leaves out a definition whose name a local shadows', () => {
  const sheet = css(`import * as css from '@typedcss/css';
import { fade } from './definitions';
const s = css.create({ a: { color: 'red' } });
export const A = ({ fade }: any) => <div sx={s.a} style={{ animationName: fade }} />;
`);
  expect(sheet).not.toContain('@keyframes');
});

it('emits a local definition read at runtime in its own file', () => {
  const sheet = css(`import * as css from '@typedcss/css';
const pulse = css.keyframes({ to: { opacity: 0.75 } });
const idle = css.keyframes({ to: { opacity: 0.6 } });
export const A = () => <div style={{ animationName: pulse }} />;
`);
  expect(sheet).toContain('opacity: 0.75');
  expect(sheet).not.toContain('opacity: 0.6');
});
