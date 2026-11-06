import type { UnpluginFactory } from 'unplugin';
import { createFilter } from '@rollup/pluginutils';
import * as path from 'path';
import * as oxide from '@typedcss/oxide';
import type { PropertyPolicyOptions, SourcePackage } from '@typedcss/oxide';
import { inSourcePackage, resolveSourcePackage } from 'zss-engine';
import { lintOverrides, startLintGuard } from '@typedcss/eslint-plugin/guard';
import {
  DEFAULT_STYLE_PROP,
  compileStylesheet,
  isRelevant,
} from './stylesheet';

export type CssImportContext = {
  id: string;
  cssId: string;
  cssFilename: string;
  css: string;
};

export type CssImportFormatter = (ctx: CssImportContext) => string | null;

export interface PluginOptions extends PropertyPolicyOptions {
  include?: string | RegExp | Array<string | RegExp>;
  exclude?: string | RegExp | Array<string | RegExp>;
  root?: string;
  devEmitToDisk?: boolean;
  styleProp?: string;
  lint?: boolean;
}

/* istanbul ignore next -- SWC reports exported constant initializers as uncovered. */
export const EXTENSION_PATTERN =
  /* istanbul ignore next */ /\.(ts|tsx|js|jsx)$/;

export const CSS_FILENAME = 'typedcss.zero.css';

export const unpluginFactory: UnpluginFactory<PluginOptions | undefined> = (
  options = {},
  unpluginMeta,
) => {
  const filter = createFilter(options.include, options.exclude);
  const styleProp = options.styleProp ?? DEFAULT_STYLE_PROP;
  let classProp: 'className' | 'class' = 'className';
  const policy: PropertyPolicyOptions = {
    withoutLogicalProperties: options.withoutLogicalProperties,
    withoutPhysicalProperties: options.withoutPhysicalProperties,
  };

  const cssLookup = new Map<string, string>();
  const cssFileLookup = new Map<string, string>();
  const targets: { id: string; dependencies: string[] }[] = [];
  const stylesheetFiles = new Set<string>();

  let cssImport: CssImportFormatter | null = null;
  let viteRoot: string = process.cwd();

  const root = () => options.root ?? viteRoot;

  // Dependencies that point the typedcss condition at their source, read once
  // per root: their files are resolved, transformed and scanned like the app's.
  let packages: { root: string; list: SourcePackage[] } | undefined;
  const packagesOf = () => {
    const at = path.resolve(root());
    if (packages?.root !== at) {
      packages = { root: at, list: oxide.sourcePackages(at) };
    }
    return packages.list;
  };
  const sourceDirs = () =>
    packagesOf().flatMap((pkg) =>
      pkg.sourceDirs.filter((dir) => dir.startsWith(pkg.dir + path.sep)),
    );
  const inSource = (file: string) =>
    inSourcePackage(packagesOf(), path.resolve(file));
  const cssFilename = () => path.join(viteRoot, CSS_FILENAME);
  const cssId = () => `/${CSS_FILENAME}`;

  const refresh = (overrides?: Map<string, string>) => {
    const { css, files } = compileStylesheet(
      {
        cwd: viteRoot,
        root: root(),
        styleProp,
        sourceDirs: sourceDirs(),
        ...policy,
      },
      overrides,
    );
    stylesheetFiles.clear();
    for (const file of files) stylesheetFiles.add(file);
    cssLookup.set(cssFilename(), css);
    cssFileLookup.set(cssId(), cssFilename());
    return css;
  };

  const lint = options.lint !== false;
  const startLint = () => {
    startLintGuard(lintOverrides(options));
  };
  const lintOnRun = (bundler: {
    hooks: { run: { tap: (name: string, fn: () => void) => void } };
  }) => {
    if (!lint) return;
    bundler.hooks.run.tap('@typedcss/unplugin', () => {
      startLint();
    });
  };
  const lintUnlessWatching = {
    buildStart(this: { meta: { watchMode: boolean } }) {
      if (lint && !this.meta.watchMode) startLint();
    },
  };

  return {
    name: '@typedcss/unplugin',
    enforce: 'pre',

    webpack: lintOnRun,
    rspack: lintOnRun,
    rollup: lintUnlessWatching,
    rolldown: lintUnlessWatching,
    vite: {
      config(_config: unknown, { command }: { command: string }) {
        if (lint && command === 'build') startLint();
      },
    },
    farm: {
      config(config: any) {
        if (lint && config?.compilation?.mode === 'production') startLint();
        return config;
      },
    },

    __typedcssInternal: {
      cssLookup,
      cssFileLookup,
      targets,
      stylesheetFiles,
      unpluginMeta,
      cssFilename,
      refresh,
      setDev(_value: boolean) {},
      setClassProp(value: 'className' | 'class') {
        classProp = value;
      },
      setRoot(value: string) {
        viteRoot = value;
      },
      setCssImport(formatter: CssImportFormatter | null) {
        cssImport = formatter;
      },
      sourcePackages: packagesOf,
      resolveSource(id: string) {
        return resolveSourcePackage(packagesOf(), id);
      },
      inSource,
    },

    resolveId(id, importer) {
      const [pathId, query] = id.split('?');
      if (pathId.endsWith('.zero.css')) {
        if (pathId.startsWith('/')) {
          return id;
        }
        if (importer && !path.isAbsolute(pathId)) {
          const resolved = path.resolve(path.dirname(importer), pathId);
          return query ? `${resolved}?${query}` : resolved;
        }
        return query ? `${pathId}?${query}` : pathId;
      }
      return resolveSourcePackage(packagesOf(), id);
    },

    loadInclude(id) {
      const [pathId] = id.split('?');
      return pathId.endsWith('.zero.css');
    },

    load(id) {
      const [pathId] = id.split('?', 1);
      const resolved = cssLookup.has(pathId)
        ? pathId
        : (cssFileLookup.get(pathId) ?? path.join(viteRoot, pathId));
      if (!cssLookup.has(resolved)) refresh();
      return cssLookup.get(resolved) ?? '';
    },

    transformInclude(id) {
      return filter(id);
    },

    transform: {
      order: 'pre',
      async handler(source, id) {
        const [baseId] = id.split('?');
        if (baseId.includes('node_modules') && !inSource(baseId)) return null;
        if (!filter(baseId) || !EXTENSION_PATTERN.test(baseId)) return null;
        if (!isRelevant(source, baseId, styleProp)) return null;

        const transformedSource = oxide.transform(source, baseId, {
          root: root(),
          styleProp,
          classProp,
          ...policy,
        });
        if (transformedSource === null) return null;

        const filename = cssFilename();
        const css = refresh(new Map([[path.resolve(baseId), source]]));

        const targetIndex = targets.findIndex((t) => t.id === id);
        const dependencies = [...stylesheetFiles];
        if (targetIndex !== -1) {
          targets[targetIndex].dependencies = dependencies;
        } else {
          targets.push({ id, dependencies });
        }

        const statement = cssImport
          ? cssImport({ id, cssId: cssId(), cssFilename: filename, css })
          : `\nimport ${JSON.stringify(cssId())};`;

        return {
          code: statement ? transformedSource + statement : transformedSource,
          map: null,
        };
      },
    },
  };
};
