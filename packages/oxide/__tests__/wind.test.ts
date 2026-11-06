import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { implementations } from './implementations';

const PACKAGE = path.resolve(__dirname, '../../wind');
const EXPORTS = [
  ...(fs.existsSync(path.join(PACKAGE, 'src/index.ts'))
    ? fs.readFileSync(path.join(PACKAGE, 'src/index.ts'), 'utf-8')
    : ''
  ).matchAll(/^export const (\w+) =/gm),
].map(([, name]) => name);

describe.each(implementations)('$name', ({ transformSource, compileCSS }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-wind-')),
  );
  let count = 0;

  const setup = (app: string) => {
    const cwd = path.join(DIR, String(count++));
    fs.mkdirSync(path.join(cwd, 'node_modules/@typedcss'), { recursive: true });
    fs.symlinkSync(
      PACKAGE,
      path.join(cwd, 'node_modules/@typedcss/wind'),
      'dir',
    );
    fs.writeFileSync(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'app',
        dependencies: { '@typedcss/wind': '*' },
      }),
    );
    fs.writeFileSync(path.join(cwd, 'app.tsx'), app);
    return cwd;
  };

  const transform = async (cwd: string) => {
    const filePath = path.join(cwd, 'app.tsx');
    const { code } = await transformSource({
      source: fs.readFileSync(filePath, 'utf-8'),
      moduleId: filePath,
      filePath,
      root: cwd,
      cwd,
      isDev: false,
    });
    return code;
  };

  it('compiles every export into a plain value', async () => {
    const filePath = path.join(PACKAGE, 'src/index.ts');
    const { code } = await transformSource({
      source: fs.readFileSync(filePath, 'utf-8'),
      moduleId: filePath,
      filePath,
      root: PACKAGE,
      cwd: PACKAGE,
      isDev: false,
    });
    expect(EXPORTS.length).toBeGreaterThan(0);
    expect(code).not.toMatch(/css\.(createStatic|keyframes)\(/);
    expect(code).toContain('oklch(62.3% 0.214 259.815)');
    for (const name of EXPORTS)
      expect(code).toContain(`export const ${name} =`);
  });

  it('keeps the import a runtime read still needs', async () => {
    const cwd = setup(`import { blue } from '@typedcss/wind';
export const accent = blue[500];
`);
    expect(await transform(cwd)).toContain("from '@typedcss/wind'");
  });

  it('compiles theme values and keyframes into the stylesheet', async () => {
    const cwd = setup(`import * as css from '@typedcss/css';
import { blue, spacing, text, radius, shadow, spin, animate } from '@typedcss/wind';
const styles = css.create({
  box: {
    color: blue[500],
    padding: spacing[4],
    fontSize: text['2xl'],
    borderRadius: radius.lg,
    boxShadow: shadow.md,
    animation: \`\${spin} \${animate.spin}\`,
  },
});
export const App = () => <div sx={styles.box} />;
`);
    const code = await transform(cwd);
    expect(code).not.toContain('@typedcss/wind');
    const sheet = compileCSS({ cwd, include: ['app.tsx'], exclude: [] });
    expect(sheet).toContain('oklch(62.3% 0.214 259.815)');
    expect(sheet).toMatch(/padding:\s*1rem/);
    expect(sheet).toMatch(/font-size:\s*1\.5rem/);
    expect(sheet).toMatch(/border-radius:\s*0?\.5rem/);
    expect(sheet).toMatch(/@keyframes kf-\w+/);
    expect(sheet).toMatch(/animation:\s*kf-\w+ 1s linear infinite/);
    expect(sheet.match(/@keyframes /g)).toHaveLength(1);
  });
});
