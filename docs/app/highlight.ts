import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeToHtml, codeToTokens, type DecorationItem } from 'shiki';

/** Highlights at build time. Each mark wraps its first occurrence in `.mark`. */
export function highlight(
  code: string,
  lang: 'tsx' | 'css',
  marks: string[] = [],
) {
  const decorations: DecorationItem[] = marks.map((mark) => {
    const start = code.indexOf(mark);
    if (start < 0) throw new Error(`Nothing to mark: ${mark}`);
    return {
      start,
      end: start + mark.length,
      properties: { class: 'mark' },
    };
  });

  return codeToHtml(code, {
    lang,
    theme: 'dark-plus',
    decorations,
  });
}

/** Reads a file under `app`, or the lines between `// #region name` and `// #endregion`. */
export function source(file: string, region?: string) {
  const text = readFileSync(join(process.cwd(), 'app', file), 'utf8');
  if (!region) return text.trim();

  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) => line.trim() === `// #region ${region}`,
  );
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === '// #endregion',
  );
  if (start < 0 || end < 0) throw new Error(`No region ${region} in ${file}`);

  return lines.slice(start + 1, end).join('\n');
}

export type Token = { text: string; style: Record<string, string> };

/** Tokens for the typing editor, so the browser never loads Shiki. */
export async function tokenize(code: string): Promise<Token[][]> {
  const { tokens } = await codeToTokens(code, {
    lang: 'tsx',
    theme: 'dark-plus',
  });

  return tokens.map((line) =>
    line.map((token) => ({
      text: token.content,
      style: {
        ...token.htmlStyle,
        ...(token.color ? { color: token.color } : {}),
      },
    })),
  );
}
