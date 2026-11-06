import type { NextConfig } from 'next';
import * as path from 'path';
import type { SourcePackage } from '@typedcss/oxide';
import { oxide } from './oxide';
import { lintOverrides } from '@typedcss/eslint-plugin/guard';
import { startNextLintGuard } from './lint';
import { DEFAULT_STYLE_PROP, PACKAGE } from './shared';
import type { TypedCSSOptions } from './shared';

export type { TypedCSSOptions } from './shared';

export type WithTypedCSSOptions = TypedCSSOptions & { lint?: boolean };

type Rules = NonNullable<NonNullable<NextConfig['turbopack']>['rules']>;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function contentPattern(styleProp: string): RegExp {
  const start = /^\w/.test(styleProp) ? '(?:^|[^\\w.])' : '';
  const end = /\w$/.test(styleProp) ? '\\b' : '';
  return new RegExp(`${escape(PACKAGE)}|${start}${escape(styleProp)}${end}`);
}

// Each subpath a source package points the typedcss condition at, aliased to
// that file, since Turbopack resolves only the conditions it knows.
function sourceAliases(
  packages: SourcePackage[],
  cwd: string,
): Record<string, string> {
  return Object.fromEntries(
    packages.flatMap((pkg) => {
      const exports = pkg.exports as Record<string, any>;
      const map = Object.keys(exports).some((key) => key.startsWith('.'))
        ? exports
        : { '.': exports };
      return Object.entries(map).flatMap(([subpath, entry]) =>
        typeof entry?.typedcss === 'string'
          ? [
              [
                pkg.name + subpath.slice(1),
                `./${path.relative(cwd, path.resolve(pkg.dir, entry.typedcss)).replace(/\\/g, '/')}`,
              ],
            ]
          : [],
      );
    }),
  );
}

// The source directories as they appear under node_modules, which also matches
// a package that pnpm links from its store.
function sourcePath(packages: SourcePackage[]): RegExp | undefined {
  const dirs = packages.flatMap((pkg) =>
    pkg.sourceDirs
      .filter((dir) => dir === pkg.dir || dir.startsWith(pkg.dir + path.sep))
      .map((dir) => {
        const inner = path.relative(pkg.dir, dir).replace(/\\/g, '/');
        return escape(`node_modules/${pkg.name}/${inner ? `${inner}/` : ''}`);
      }),
  );
  return dirs.length > 0
    ? new RegExp(`(?:^|/)(?:${dirs.join('|')})`)
    : undefined;
}

export function withTypedCSS(
  nextConfig: NextConfig = {},
  { lint = true, ...options }: WithTypedCSSOptions = {},
): NextConfig {
  if (lint) startNextLintGuard(lintOverrides(options));
  const root = options.root ?? process.cwd();
  const loaderOptions: Record<string, unknown> = { ...options, root };
  const packages = oxide.sourcePackages(root);
  const fromPackage = sourcePath(packages);
  const rule = {
    loaders: [
      {
        loader: '@typedcss/next-plugin/loader',
        options: loaderOptions as Record<string, never>,
      },
    ],
    condition: {
      all: [
        fromPackage
          ? { any: [{ not: 'foreign' }, { path: fromPackage }] }
          : { not: 'foreign' },
        { content: contentPattern(options.styleProp ?? DEFAULT_STYLE_PROP) },
      ],
    },
  };
  const rules = {
    '*.ts': rule,
    '*.tsx': rule,
    '*.js': rule,
    '*.jsx': rule,
    'zero-virtual.css': {
      loaders: [
        {
          loader: '@typedcss/next-plugin/css',
          options: loaderOptions as Record<string, never>,
        },
      ],
      as: '*.css',
    },
  } as Rules;
  if (packages.length === 0) {
    return {
      ...nextConfig,
      turbopack: {
        ...nextConfig.turbopack,
        rules: { ...nextConfig.turbopack?.rules, ...rules },
      },
    };
  }
  return {
    ...nextConfig,
    transpilePackages: [
      ...(nextConfig.transpilePackages ?? []),
      ...packages.map((pkg) => pkg.name),
    ],
    turbopack: {
      ...nextConfig.turbopack,
      resolveAlias: {
        ...sourceAliases(packages, process.cwd()),
        ...nextConfig.turbopack?.resolveAlias,
      },
      rules: { ...nextConfig.turbopack?.rules, ...rules },
    },
  };
}

export default withTypedCSS;
