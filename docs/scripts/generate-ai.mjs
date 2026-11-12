import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceUrl = 'https://plumeria.dev/docs/ai.md';
const output = new URL('../public/docs/ai.md', import.meta.url);
const license = await readFile(new URL('../../LICENSE', import.meta.url), 'utf8');

// Keep upstream examples and selector rules; replace compile-time-only guidance.
export function generateAI(source) {
  if (!source.startsWith('# AI.md') || !source.includes('@plumeria/core')) {
    throw new Error('Expected the Plumeria AI Markdown document.');
  }
  let text = source.replaceAll('@plumeria/core', '@typedcss/css')
    .replaceAll('@plumeria/', '@typedcss/')
    .replaceAll('plumeria.configs', 'typedcss.configs')
    .replaceAll('plumeria.d.ts', 'typedcss.d.ts')
    .replaceAll('plumeria-lint', 'typedcss-lint')
    .replaceAll('[plumeria]', '[typedcss]')
    .replaceAll('Plumeria', 'TypedCSS');

  const replace = (pattern, replacement) => {
    if (!pattern.test(text)) throw new Error(`Upstream structure changed: ${pattern}`);
    text = text.replace(pattern, replacement);
  };
  const section = (title, next, body) => {
    replace(new RegExp(`## ${title}[^\\n]*\\n[\\s\\S]*?(?=## ${next})`), `## ${title}\n\n${body}\n\n`);
  };

  replace(/^[-*] Pass a received `Style` prop on to another component\..*$/m,
    '');

  section('Mental Model', 'Core Usage', `- \`css.create()\` is compiled at build time into runtime class maps; CSS is extracted into a stylesheet.
- \`sx\` on an element compiles to a spread of \`css.props(...)\`, which merges styles at runtime and supplies \`className\` and any CSS variables on \`style\`.
- Compose arrays with right-wins precedence. Style values can pass through props, context, variables, and other packages before reaching an element.
- Import from \`@typedcss/css\`. The shared authoring API makes migration to Plumeria possible; its compiler has stricter component-boundary rules.`);

  replace(/\*\*Cross-file imports\.\*\*[^\n]*/, '**Cross-file imports.** Import compiled styles from other files as runtime values. Keep `@typedcss/css` imported in files using `sx` so the integration can process them.');
  replace(/\*\*Definitions from a package\.\*\*[^\n]*/, '**Definitions from a package.** Share compiled class maps as runtime exports.');
  replace(/\*\*Components from a package\.\*\*[^\n]*/, '**Components from a package.** Pass `css.Style` through props and merge it on the element with `sx` or `css.props()`.');
  replace(/\*\*Imports that compile away\.\*\*[^\n]*/, '**Runtime imports.** Imports of compiled class maps and runtime helpers remain when used.');
  replace(/The compiler turns these expressions into static lookup tables at build time:/, 'Bracket notation selects a compiled style map at runtime:');
  replace(/^\* \*\*Keep variant `css.create\(\)` calls minimal\.\*\*.*$/m, '* **Keep variants focused.** Group related variants for clarity. Bracket notation selects their runtime class maps.');
  replace(/^\* \*\*Local variable assignment is supported\.\*\*.*$/m, '* **Local variable assignment is supported.** `const currentStyle = sizeStyles[size]; <div sx={currentStyle} />` works with runtime class maps.');
  replace(/### `css.use\(\)` returns a static string[^\n]*\n[\s\S]*?(?=## Advanced APIs)/,
    '### `css.use()` returns a class name string\n\n`css.use()` merges class maps at runtime. It does not set CSS variables on `style`; use `sx` or spread `css.props()` for function keys.\n\n');
  replace(/There are exactly \*\*2 patterns\*\*[^\n]*/, 'Use `sx` on an element or accept a `css.Style` prop on a custom component. Styles merge at runtime on the element.');
  replace(/> \*\*Core principle\*\*[^\n]*/, '> **Core principle**: `Style` values are runtime class maps. They can pass through multiple component boundaries.');
  replace(/A component takes a style through a prop typed as `css.Style`[^\n]*/, 'A component can receive `css.Style` through `sx` or another prop, then apply it on an element or forward it to another component. Compose `[styles.text, styleArray]` so call-site styles override base styles.');
  replace(/### Anti-pattern: relaying a `Style` prop[^\n]*\n[\s\S]*?(?=### Summary)/,
    `### Plumeria migration compatibility\n\nTypedCSS supports relaying a received \`css.Style\` through props, context, variables, and other components. This is valid TypedCSS code.\n\nIf you plan to migrate to Plumeria, we recommend applying each received style on an element rendered by that component instead of forwarding it through wrappers. Plumeria requires this shape for static compilation. Treat this as a migration recommendation, not a TypedCSS restriction.\n\n`);
  replace(/In both patterns the component \*\*applies\*\*[^\n]*/, 'Applying a received style directly is recommended for Plumeria migration compatibility; forwarding it is supported in TypedCSS.');
  replace(/^[-*] Route a function key through `css.use\(\)`.*$/m, '');
  replace(/### `css.use\(\)` returns a class name string\n[\s\S]*?(?=## Advanced APIs)/,
    '### `css.props()` returns element props\n\n`css.props()` merges class maps at runtime and returns `{ className, style }`. Spread the result onto an element. Function keys are supported: their CSS variables are passed through `style`. Prefer `sx` for the API shared with Plumeria.\n\n');
  text = text.replaceAll('Traced and compiled', 'Merged at runtime')
    .replaceAll('css.use(', 'css.props(')
    .replaceAll('name={css.props(transition.name)}', 'name={css.props(transition.name).className}')
    .replaceAll('// The compiler transforms sx → className here', '// The compiler transforms sx into a css.props() spread here')
    .replaceAll('// The compiler traces styleArray and resolves it statically', '// styleArray merges with the base styles at runtime')
    .replaceAll('It publishes types and no runtime.', 'It publishes runtime helpers and types; style definitions still require the compiler transform.')
    .replaceAll('plumeria.vite()', 'typedcss.vite()');
  return text.replace(/^Source:.*$/m, `Source: https://plumeria.dev/docs/ai\n\nGenerated by \`docs/scripts/generate-ai.mjs\`. Do not edit this file directly.\nAdapted for TypedCSS; prop-relay guidance is a recommendation for migration to Plumeria.`) + `\n<!--\nAdapted from Plumeria documentation, https://plumeria.dev/docs/ai\n${license.trim()}\n-->\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf('--source');
  let source;
  if (sourceIndex !== -1) {
    if (!process.argv[sourceIndex + 1]) throw new Error('--source requires a Markdown path.');
    source = await readFile(process.argv[sourceIndex + 1], 'utf8');
  } else {
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
    source = await response.text();
  }
  const markdown = generateAI(source);
  await mkdir(new URL('../public/docs/', import.meta.url), { recursive: true });
  await writeFile(output, markdown);
  console.log(`Generated ${fileURLToPath(output)}`);
}
