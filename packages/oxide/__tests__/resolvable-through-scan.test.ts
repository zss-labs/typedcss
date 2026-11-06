import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_STYLE_PROP } from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-scan-')),
  );

  const animation = path.join(dir, 'animation.ts');
  fs.writeFileSync(
    animation,
    `import * as css from '@typedcss/css';\nexport const spin = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });\n`,
  );

  const local = path.join(dir, 'local.tsx');
  const localSource = `import * as css from '@typedcss/css';
const fade = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const swap = css.viewTransitionClass({ old: { opacity: 0 } });
const styles = css.create({
  box: { animationName: fade, viewTransitionName: swap, animationDuration: '1s' },
});
`;
  fs.writeFileSync(local, localSource);

  const imported = path.join(dir, 'imported.tsx');
  const importedSource = `import * as css from '@typedcss/css';
import { spin } from './animation';
const styles = css.create({ box: { animationName: spin, animationDuration: '1s' } });
`;
  fs.writeFileSync(imported, importedSource);

  const compile = (filePath: string, source: string) =>
    transformSource({
      source,
      moduleId: filePath,
      filePath,
      root: dir,
      cwd: dir,
      styleProp: DEFAULT_STYLE_PROP,
      propertyPolicy: undefined,
      isDev: false,
      addDependency: () => {},
    });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  // The unresolvable-value check compares the keys a style object was given
  // against the keys it resolved, and a name that only the scan can resolve is
  // absent until the scan has run. These two shapes are the ones that check
  // would reject first if it ever ran ahead of the tables being merged.
  describe('a name the scan resolves is not treated as a dropped value', () => {
    // typedcss has no separate project scan: each file resolves its own names
    // and links imported ones when the stylesheet is built.

    it('accepts a keyframes and a viewTransitionClass declared in the same file', async () => {
      await expect(compile(local, localSource)).resolves.toBeDefined();
    });

    it('accepts a keyframes imported from another file', async () => {
      await expect(compile(imported, importedSource)).resolves.toBeDefined();
    });
  });
});
