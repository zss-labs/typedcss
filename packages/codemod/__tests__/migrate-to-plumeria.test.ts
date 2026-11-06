import { RuleTester } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import {
  migrateToPlumeria,
  toPlumeria,
} from '../src/transforms/migrate-to-plumeria';

import type { Linter } from 'eslint';

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser as unknown as Linter.Parser,
  },
});

const source = { messageId: 'source' };
const rename = { messageId: 'rename' };

describe('toPlumeria', () => {
  it('maps the packages a project depends on to their Plumeria names', () => {
    expect(toPlumeria('@typedcss/css')).toBe('@plumeria/core');
    expect(toPlumeria('@typedcss/eslint-plugin')).toBe(
      '@plumeria/eslint-plugin',
    );
    expect(toPlumeria('@typedcss/oxide')).toBeNull();
    expect(toPlumeria('@typedcss/unplugin/vite')).toBe(
      '@plumeria/unplugin/vite',
    );
    expect(toPlumeria('@typedcss/next-plugin')).toBe('@plumeria/next-plugin');
    expect(toPlumeria('typedcss')).toBeNull();
    expect(toPlumeria('react')).toBeNull();
  });
});

tester.run('migrate-to-plumeria', migrateToPlumeria, {
  valid: [
    `import * as css from '@plumeria/core';`,
    `import { withPlumeria } from '@plumeria/next-plugin';`,
    // withTypedCSS from elsewhere is not the plugin
    `import { withTypedCSS } from './local';
withTypedCSS();`,
  ],
  invalid: [
    {
      code: `import * as css from '@typedcss/css';
import type { CSSProperties } from "@typedcss/css";`,
      output: `import * as css from '@plumeria/core';
import type { CSSProperties } from "@plumeria/core";`,
      errors: [source, source],
    },
    {
      code: `import plumeria from '@typedcss/unplugin/vite';
export default { plugins: [plumeria()] };`,
      output: `import plumeria from '@plumeria/unplugin/vite';
export default { plugins: [plumeria()] };`,
      errors: [source],
    },
    {
      code: `import { withTypedCSS } from '@typedcss/next-plugin';
export default withTypedCSS(nextConfig);`,
      output: `import { withPlumeria } from '@plumeria/next-plugin';
export default withPlumeria(nextConfig);`,
      errors: [rename, source, rename],
    },
    {
      // an alias keeps its local name
      code: `import { withTypedCSS as withCSS } from '@typedcss/next-plugin';
export default withCSS(nextConfig);`,
      output: `import { withPlumeria as withCSS } from '@plumeria/next-plugin';
export default withCSS(nextConfig);`,
      errors: [rename, source],
    },
    {
      code: `const { withTypedCSS } = require('@typedcss/next-plugin');
module.exports = withTypedCSS({});`,
      output: `const { withPlumeria } = require('@plumeria/next-plugin');
module.exports = withPlumeria({});`,
      errors: [rename, source, rename],
    },
    {
      code: `const { withTypedCSS: withCSS } = require('@typedcss/next-plugin');`,
      output: `const { withPlumeria: withCSS } = require('@plumeria/next-plugin');`,
      errors: [rename, source],
    },
    {
      code: `const css = await import('@typedcss/css');
export * from '@typedcss/css';`,
      output: `const css = await import('@plumeria/core');
export * from '@plumeria/core';`,
      errors: [source, source],
    },
  ],
});
