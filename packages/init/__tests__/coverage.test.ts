import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detect } from '../src/detect';
import { DEFAULT_ANSWERS, oxlintEntries, plan } from '../src/setup';
import type { Action, Answers } from '../src/setup';

const add = (root: string, file: string, source: string) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
};

const answer = (fields: Partial<Answers> = {}): Answers => ({
  ...DEFAULT_ANSWERS,
  ...fields,
});

const actionOn = (actions: Action[], file: string) => {
  const action = actions.find(
    (item) => item.kind !== 'install' && item.file === file,
  );
  if (!action) throw new Error(`missing action for ${file}`);
  return action;
};

describe('remaining setup branches', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-init-coverage-')),
    );
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('uses the simple spelling rule when sizes are not enforced', () => {
    expect(
      oxlintEntries(answer({ spelling: 'physical', sizes: false })).rules,
    ).toMatchObject({
      '@typedcss/no-logical-properties': 'error',
    });
    expect(oxlintEntries(answer()).settings).toBeUndefined();
  });

  it('replaces malformed optional oxlint sections while merging settings', () => {
    add(
      root,
      'package.json',
      JSON.stringify({ devDependencies: { vite: '1', oxlint: '1' } }),
    );
    add(root, 'vite.config.ts', 'export default { plugins: [] };');
    add(
      root,
      '.oxlintrc.json',
      JSON.stringify({ jsPlugins: 'bad', rules: [], settings: [] }),
    );

    const action = actionOn(
      plan(detect(root), answer({ styleProp: 'classStyle' })),
      '.oxlintrc.json',
    );
    if (action.kind !== 'patch') throw new Error('expected a patch');
    const config = JSON.parse(action.contents);
    expect(config.jsPlugins).toHaveLength(1);
    expect(config.rules['@typedcss/no-unknown-css-properties']).toBe('error');
    expect(config.settings).toEqual({ typedcss: { styleProp: 'classStyle' } });
  });

  it('merges into valid optional oxlint sections and existing settings', () => {
    add(
      root,
      'package.json',
      JSON.stringify({ devDependencies: { vite: '1', oxlint: '1' } }),
    );
    add(root, 'vite.config.ts', 'export default { plugins: [] };');
    add(
      root,
      '.oxlintrc.json',
      JSON.stringify({ jsPlugins: [], rules: {}, settings: { project: true } }),
    );

    const action = actionOn(
      plan(detect(root), answer({ styleProp: 'classStyle' })),
      '.oxlintrc.json',
    );
    if (action.kind !== 'patch') throw new Error('expected a patch');
    expect(JSON.parse(action.contents).settings).toEqual({
      project: true,
      typedcss: { styleProp: 'classStyle' },
    });

    const withoutCustomSettings = actionOn(
      plan(detect(root), answer()),
      '.oxlintrc.json',
    );
    expect(withoutCustomSettings.kind).toBe('patch');
  });

  it('explains when a guarded bundler has no build script', () => {
    add(
      root,
      'package.json',
      JSON.stringify({ devDependencies: { esbuild: '1' } }),
    );
    const action = actionOn(plan(detect(root), answer()), 'package.json');
    expect(action).toMatchObject({
      kind: 'skip',
      note: 'no build script to guard',
    });
  });
});
