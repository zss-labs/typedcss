import { createVitePlugin } from 'unplugin';
import { unpluginFactory, EXTENSION_PATTERN } from './core';
import type { PluginOptions } from './core';
import * as path from 'path';
import * as oxide from '@typedcss/oxide';
import type {
  ViteDevServer,
  ModuleNode,
  ResolvedConfig,
  HmrContext,
  Plugin,
  UserConfig,
} from 'vite';
import { createDiskCssImport } from './disk-css';

function isRscConfig(userConfig: UserConfig): boolean {
  if ((userConfig as any).environments?.rsc) return true;

  const plugins = ((userConfig.plugins ?? []) as unknown[])
    .flat(Infinity)
    .filter((p): p is { name?: string } => !!p && typeof p === 'object');

  return plugins.some((p) => p.name === 'rsc' || !!p.name?.startsWith('rsc:'));
}

function attachViteHooks(plugin: any, options?: VitePluginOptions) {
  let devServer: ViteDevServer | undefined;
  const {
    cssLookup,
    cssFileLookup,
    targets,
    setDev,
    setRoot,
    setCssImport,
    setClassProp,
    stylesheetFiles,
    cssFilename: sheetFilename,
    refresh,
    resolveSource,
    inSource,
  } = plugin.__typedcssInternal;

  const useDiskEmit = options?.devEmitToDisk ?? false;
  let isDev = false;
  let viteRoot = process.cwd();

  const diskCssImport = useDiskEmit
    ? createDiskCssImport(() => viteRoot)
    : null;

  setCssImport((ctx: any) => {
    if (isRsc && isBuild) return null;
    if (isDev && diskCssImport) return diskCssImport(ctx);
    return `\nimport ${JSON.stringify(ctx.cssId)};`;
  });

  // Last CSS text pushed per virtual CSS module, to skip no-op reloads.
  const lastServedCss = new Map<string, string>();

  let isRsc = false;
  let isBuild = false;
  let sheetRef: string | undefined;

  const clientCssModules = (cssFilename: string) => {
    const clientEnv = (devServer as any)?.environments?.client;
    const graph = clientEnv?.moduleGraph;
    if (!graph) return null;

    const mods = new Set<any>(graph.getModulesByFile(cssFilename) ?? []);
    const byId = graph.getModuleById(cssFilename);
    if (byId) mods.add(byId);
    return { clientEnv, graph, mods };
  };

  const invalidateClientCss = (cssFilename: string) => {
    const found = clientCssModules(cssFilename);
    if (!found || found.mods.size === 0) return;

    found.mods.forEach((m) => found.graph.invalidateModule(m));

    const cssId = `/${path.relative(viteRoot, cssFilename).replace(/\\/g, '/')}`;
    found.clientEnv.hot.send({
      type: 'update',
      updates: [
        {
          type: 'css-update',
          timestamp: Date.now(),
          path: cssId,
          acceptedPath: cssId,
        },
      ],
    });
  };

  const reloadClientCss = (cssFilename: string) => {
    const found = clientCssModules(cssFilename);
    if (found && found.mods.size > 0) {
      found.mods.forEach((m) => found.clientEnv.reloadModule(m));
      return true;
    }
    return false;
  };

  const baseTransform = plugin.transform;
  plugin.transform = {
    order: 'pre',
    async handler(this: any, code: string, id: string) {
      const result = await baseTransform.handler.call(this, code, id);

      if (
        !useDiskEmit &&
        devServer &&
        result &&
        typeof result === 'object' &&
        result.code.includes('.zero.css')
      ) {
        // Virtual module HMR: signal Vite to reload the CSS module,
        // but only when its content actually changed (avoids repaint flicker).
        const cssFilename = sheetFilename();
        const cssContent = cssLookup.get(cssFilename) ?? '';
        const envName = (this as any).environment?.name;
        const seenKey = `${envName ?? ''}:${cssFilename}`;

        if (envName && envName !== 'client') {
          if (lastServedCss.get(seenKey) !== cssContent) {
            lastServedCss.set(seenKey, cssContent);
            invalidateClientCss(cssFilename);
          }
        } else if (lastServedCss.get(seenKey) !== cssContent) {
          if (reloadClientCss(cssFilename)) {
            lastServedCss.set(seenKey, cssContent);
          } else {
            const mod = devServer.moduleGraph.getModuleById(cssFilename);
            if (mod) {
              lastServedCss.set(seenKey, cssContent);
              devServer.reloadModule(mod);
            }
          }
        }
      }

      return result;
    },
  };

  const vitePlugin = {
    ...plugin,
    name: '@typedcss/unplugin:vite',
    vite: undefined,

    config(userConfig: UserConfig, { command }: { command: string }) {
      plugin.vite?.config?.(userConfig, { command });
      // A package that exports typedcss source is transformed by this plugin,
      // so it stays out of pre-bundling and out of the SSR externals.
      const sourceNames = oxide
        .sourcePackages(path.resolve(userConfig.root ?? ''))
        .map((pkg) => pkg.name);
      const configToReturn: UserConfig = {
        optimizeDeps: {
          exclude: [
            ...(userConfig.optimizeDeps?.exclude ?? []),
            '@typedcss/css',
            ...sourceNames,
          ],
        },
        ...(sourceNames.length > 0 ? { ssr: { noExternal: sourceNames } } : {}),
      };

      isBuild = command === 'build';
      isRsc = isRscConfig(userConfig);

      if (isBuild && !isRsc) {
        configToReturn.build = {
          ...(userConfig.build ?? {}),
          cssCodeSplit: false,
        };
      }

      if (isBuild && isRsc) {
        configToReturn.environments = {
          rsc: { build: { cssCodeSplit: false } },
        };
      }

      return configToReturn;
    },

    buildStart() {
      sheetRef = undefined;
    },

    async buildEnd(this: any) {
      if (!isRsc || !isBuild) return;
      if (this.environment?.name !== 'rsc') return;

      const source = cssLookup.get(sheetFilename()) ?? refresh();
      if (!source.trim()) return;

      sheetRef = this.emitFile({
        type: 'asset',
        name: 'typedcss.css',
        source,
      });
    },

    renderChunk(this: any, _code: string, chunk: any) {
      if (!sheetRef) return null;
      if (this.environment?.name !== 'rsc') return null;
      chunk.viteMetadata.importedCss.add(this.getFileName(sheetRef));
      return null;
    },

    configResolved(config: ResolvedConfig) {
      viteRoot = config.root;
      setRoot(config.root);
      if (config.plugins?.some((entry) => entry?.name === 'solid')) {
        setClassProp('class');
      }
      if (config.command === 'serve') {
        isDev = true;
        setDev(true);
      }
    },

    configureServer(server: ViteDevServer) {
      devServer = server;
    },

    handleHotUpdate(ctx: HmrContext) {
      if (!devServer) return;

      const modules = [...ctx.modules];
      if (ctx.file.includes('node_modules') && !inSource(ctx.file))
        return modules;

      const addModule = (m: ModuleNode | undefined | null) => {
        if (m && !modules.includes(m)) {
          modules.push(m);
        }
      };

      if (!EXTENSION_PATTERN.test(ctx.file)) return modules;
      if (!stylesheetFiles.has(ctx.file)) return modules;

      targets
        .filter((t: any) => t.id !== ctx.file)
        .map((t: any) => devServer!.moduleGraph.getModuleById(t.id))
        .forEach((m: any) => addModule(m as ModuleNode | null));

      return modules;
    },
  };

  // When using disk emission, remove virtual module hooks
  // since CSS is served from a real file on disk
  if (!useDiskEmit) {
    vitePlugin.resolveId = function (importeeUrl: string) {
      const queryIndex = importeeUrl.indexOf('?');
      const id =
        queryIndex === -1 ? importeeUrl : importeeUrl.slice(0, queryIndex);
      const query = queryIndex === -1 ? '' : importeeUrl.slice(queryIndex);
      if (cssLookup.has(id)) {
        return id + query;
      }
      const resolved = cssFileLookup.get(id);
      if (resolved) {
        return resolved + query;
      }
      return resolveSource(importeeUrl);
    };

    vitePlugin.load = function (url: string) {
      const [id] = url.split('?', 1);
      return cssLookup.get(id) ?? null;
    };
  }

  return vitePlugin;
}

export type VitePluginOptions = {
  [K in keyof PluginOptions]: PluginOptions[K];
} & {};

export default createVitePlugin<VitePluginOptions | undefined>(
  (options, metaOptions) =>
    attachViteHooks(unpluginFactory(options, metaOptions), options),
) as (options?: VitePluginOptions) => Plugin;
