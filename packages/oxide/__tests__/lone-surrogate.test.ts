import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { implementations } from './implementations';

const LONE = /contains a lone surrogate, which CSS cannot represent/;

const moduleWith = (styles: string) => `import * as css from '@typedcss/css';
const styles = css.create(${styles});
export const Box = () => <div sx={styles.box} />;
`;

describe.each(implementations)('$name', ({ compileCSS, transformSource }) => {
  const DIR = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'typedcss-lone-surrogate-')),
  );
  let count = 0;
  const compile = (styles: string) => {
    const cwd = path.join(DIR, String(count++));
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(cwd, 'box.tsx'), moduleWith(styles));
    return compileCSS({ include: ['**/*.tsx'], exclude: [], cwd });
  };

  afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

  it.each([
    ['a string value', `{ box: { content: '"\\uD800"' } }`],
    ['a template value', '{ box: { content: `"\\uD800"` } }'],
    ['a string key', `{ '\\uD800x': { color: 'red' }, box: { color: 'red' } }`],
    [
      'a string after an escaped backslash',
      `{ box: { content: '"\\\\\\uD800"' } }`,
    ],
    [
      'a computed string key',
      `{ ['\\uD800x']: { color: 'red' }, box: { color: 'red' } }`,
    ],
  ])('rejects a lone surrogate in %s', (_name, styles) => {
    expect(() => compile(styles)).toThrow(LONE);
  });

  it.each([
    ['a string', `'"\\uD800"'`],
    ['a template', '`"\\uD800"`'],
  ])(
    'stops on a lone surrogate in %s read through a const',
    async (_, init) => {
      const cwd = path.join(DIR, String(count++));
      const file = path.join(cwd, 'box.tsx');
      const source = `import * as css from '@typedcss/css';
const content = ${init};
const styles = css.create({ box: { content } });
export const Box = () => <div sx={styles.box} />;
`;
      fs.mkdirSync(cwd);
      fs.writeFileSync(file, source);

      await expect(
        transformSource({ source, filePath: file, root: cwd, cwd }),
      ).rejects.toThrow(/\[typedcss\]/);
    },
  );

  it('keeps an escaped backslash written before the letter u', () => {
    expect(() => compile(`{ box: { content: '"\\\\uD800"' } }`)).not.toThrow();
  });

  it('keeps a complete surrogate pair', () => {
    expect(compile(`{ box: { content: '"\\uD83D\\uDE00"' } }`)).toContain(
      'content: "😀"',
    );
  });
});
