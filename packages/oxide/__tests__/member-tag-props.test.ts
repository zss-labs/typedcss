import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEFAULT_STYLE_PROP,
  evaluateModule,
  getStyleRecords,
  hostElement,
} from './implementations';
import { implementations } from './implementations';

describe.each(implementations)('$name', ({ transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-')),
  );
  const LEAF = path.join(DIR, 'logo.tsx');
  const MID = path.join(DIR, 'social.tsx');
  const TOP = path.join(DIR, 'icons.tsx');
  const PARENT = path.join(DIR, 'Home.tsx');

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

  // `PlumeriaLogo` is declared here and only reachable from the parent through
  // namespace objects, so nothing but the leaf itself names the styling channel.
  const files: Record<string, string> = {
    [LEAF]: `
import * as css from '@typedcss/css';
export function PlumeriaLogo({ styleArray }: { styleArray?: css.Style }) {
  return <svg sx={styleArray} />;
}
`,
    [MID]: `
import '@typedcss/css';
import { PlumeriaLogo } from './logo';
export const Social = { PlumeriaLogo };
`,
    [TOP]: `
import '@typedcss/css';
import { Social } from './social';
export const Icons = { Social };
`,
    [PARENT]: `
import * as css from '@typedcss/css';
import * as ns from './icons';
import { Icons } from './icons';

const styles = css.create({ a: { color: 'red' }, b: { color: 'blue' } });

export const Home = () => (
  <div>
    <Icons.Social.PlumeriaLogo styleArray={styles.a} />
    <ns.Icons.Social.PlumeriaLogo styleArray={styles.b} />
  </div>
);
`,
  };

  const RED = getStyleRecords({ color: 'red' })[0].hash;
  const BLUE = getStyleRecords({ color: 'blue' })[0].hash;

  const run = (file: string): Promise<{ code: string }> => {
    return transformSource(env(files[file], file)) as Promise<{ code: string }>;
  };

  beforeAll(() => {
    for (const [p, src] of Object.entries(files)) fs.writeFileSync(p, src);
  });

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  // Plumeria rewrites the props into lookup keys and gives the leaf a map of
  // them. typedcss passes the styles themselves, so the parent is rendered
  // through the namespace chain and each leaf has to receive its own style.
  describe('transform: styles passed to a member-chain tag', () => {
    const modules: Record<string, Record<string, any>> = {};
    const load = (name: string) => modules[name];

    beforeAll(async () => {
      modules['./logo'] = evaluateModule((await run(LEAF)).code, LEAF);
      modules['./social'] = evaluateModule((await run(MID)).code, MID, load);
      modules['./icons'] = evaluateModule((await run(TOP)).code, TOP, load);
    });

    it('replaces the parent props with lookup keys', async () => {
      const { code } = await run(PARENT);
      const home = evaluateModule(code, PARENT, load).Home();
      const classes = home.props.children.map(
        (child: unknown) => hostElement(child)?.props.className,
      );
      expect(classes).toEqual([RED, BLUE]);
    });

    // Not a typedcss requirement: typedcss has no lookup map; the leaf merges whatever style it receives.
    it.skip('compiles the leaf component with both styles in its lookup map', async () => {
      await run(PARENT);
      const { code } = await run(LEAF);
      const map = code.match(/\{("\w+":"\w+",?)+\}/)?.[0];
      expect(map && Object.keys(JSON.parse(map))).toHaveLength(2);
    });
  });
});
