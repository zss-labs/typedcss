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
    `export {};`,
    `export { value } from './local';
export * from './local';
const value = require(name);
const other = factory('@typedcss/css');
const third = object.require('@typedcss/css');
const fourth = object.require;`,
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
    {
      code: `export { withTypedCSS } from '@typedcss/next-plugin';`,
      output: `export { withPlumeria } from '@plumeria/next-plugin';`,
      errors: [rename, source],
    },
    {
      code: `type Core = import('@typedcss/css');`,
      output: `type Core = import('@plumeria/core');`,
      errors: [source],
    },
    {
      code: `import plugin, { unrelated, 'withTypedCSS' as withCSS } from '@typedcss/next-plugin';`,
      output: `import plugin, { unrelated, 'withTypedCSS' as withCSS } from '@plumeria/next-plugin';`,
      errors: [source],
    },
    {
      code: `const plugin = require('@typedcss/next-plugin');
const { ...rest } = require('@typedcss/next-plugin');
const { ['withTypedCSS']: computed } = require('@typedcss/next-plugin');
const { 'withTypedCSS': quoted } = require('@typedcss/next-plugin');
const { unrelated } = require('@typedcss/next-plugin');
const { withTypedCSS: { nested } } = require('@typedcss/next-plugin');`,
      output: `const plugin = require('@plumeria/next-plugin');
const { ...rest } = require('@plumeria/next-plugin');
const { ['withTypedCSS']: computed } = require('@plumeria/next-plugin');
const { 'withTypedCSS': quoted } = require('@plumeria/next-plugin');
const { unrelated } = require('@plumeria/next-plugin');
const { withPlumeria: { nested } } = require('@plumeria/next-plugin');`,
      errors: [source, source, source, source, source, rename, source],
    },
  ],
});

describe('defensive visitor branches', () => {
  const report = jest.fn();
  const visitors = migrateToPlumeria.create({
    report,
    sourceCode: { getDeclaredVariables: () => [] },
  } as never) as Record<string, (node: any) => void>;

  beforeEach(() => report.mockClear());

  it('accepts declarations without specifiers and legacy TS import nodes', () => {
    visitors.ImportDeclaration({
      source: {
        type: 'Literal',
        value: '@typedcss/next-plugin',
        raw: "'@typedcss/next-plugin'",
      },
      specifiers: undefined,
    });
    visitors.ExportNamedDeclaration({
      source: { type: 'Literal', value: './local', raw: "'./local'" },
      specifiers: null,
    });
    visitors.TSImportType({
      argument: {
        type: 'Literal',
        value: '@typedcss/css',
        raw: "'@typedcss/css'",
      },
    });
    visitors.TSImportType({ argument: undefined });

    expect(report).toHaveBeenCalledTimes(2);
  });

  it('handles a shorthand without a declared variable', () => {
    visitors.VariableDeclarator({
      init: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'require' },
        arguments: [{ value: '@typedcss/next-plugin' }],
      },
      id: {
        type: 'ObjectPattern',
        properties: [
          {
            type: 'Property',
            computed: false,
            shorthand: true,
            key: { type: 'Identifier', name: 'withTypedCSS' },
            value: { type: 'Identifier', name: 'withTypedCSS' },
          },
          {
            type: 'Property',
            computed: false,
            shorthand: true,
            key: { type: 'Identifier', name: 'withTypedCSS' },
            value: { type: 'ObjectPattern', properties: [] },
          },
        ],
      },
    });

    expect(report).toHaveBeenCalledTimes(1);
  });
});
