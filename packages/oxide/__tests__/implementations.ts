// Plumeria's compiler tests run against oxide through this adapter, which
// offers the same transformSource and compileCSS shapes on top of
// oxide.transform and oxide.compileCss. A real build runs both, so transformSource
// also links the file against the project and fails where the build would.
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import * as swc from '@swc/core';
import * as oxide from '../index';

export type { PropertyPolicyOptions } from '../index';

export const DEFAULT_STYLE_PROP = 'sx';

type TransformEnv = {
  source: string;
  moduleId?: string;
  filePath: string;
  root?: string;
  cwd?: string;
  styleProp?: string;
  classProp?: string;
  [key: string]: unknown;
};

type CompilerOptions = {
  include?: string[];
  exclude?: string[];
  cwd?: string;
  styleProp?: string;
  classProp?: string;
  sources?: Record<string, string>;
  files?: string[];
  [key: string]: unknown;
};

const POLICY = [
  'withoutLogicalProperties',
  'withoutPhysicalProperties',
] as const;

// Plumeria hands transformSource a resolved policy; oxide takes the options it came from.
const policyOf = (options: Record<string, unknown>) => {
  const resolved = options.propertyPolicy as
    | { reject: string; includeAxes: boolean }
    | undefined;
  if (resolved) {
    const key =
      resolved.reject === 'logical'
        ? 'withoutLogicalProperties'
        : 'withoutPhysicalProperties';
    return { [key]: { sizes: resolved.includeAxes } };
  }
  return Object.fromEntries(
    POLICY.filter((key) => options[key] !== undefined).map((key) => [
      key,
      options[key],
    ]),
  );
};

const RELEVANT = /@typedcss\/css|export\s*(\*|\{[^}]*\})\s*from/;

function files(options: CompilerOptions): string[] {
  const cwd = options.cwd ?? process.cwd();
  if (options.files && options.files.length > 0) {
    return options.files.map((file) => path.resolve(cwd, file));
  }
  const include =
    options.include && options.include.length > 0
      ? options.include
      : ['**/*.{js,jsx,ts,tsx}'];
  return (
    oxide
      .globFiles(include, cwd, [
        '**/node_modules/**',
        ...(options.exclude ?? []),
      ])
      .map((file) => path.join(cwd, file))
      // A file deleted between listing and reading is skipped, as the plugins do.
      .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
  );
}

const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
const EXTENSIONS = [
  '',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '/index.tsx',
  '/index.ts',
  '/index.jsx',
  '/index.js',
];

function mapped(specifier: string, cwd: string): string {
  const config = path.join(cwd, 'tsconfig.json');
  if (!fs.existsSync(config)) return specifier;
  const paths: Record<string, string[]> =
    JSON.parse(fs.readFileSync(config, 'utf8')).compilerOptions?.paths ?? {};
  for (const [pattern, [target]] of Object.entries(paths)) {
    const prefix = pattern.replace(/\*$/, '');
    if (target && specifier.startsWith(prefix))
      return target.replace(/\*$/, '') + specifier.slice(prefix.length);
  }
  return specifier;
}

// oxide links the files it is handed, so the files a compiled file imports go
// along with it, the way Plumeria's compiler reads them from disk.
function imported(file: string, source: string, cwd: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    const base = specifier.startsWith('.')
      ? path.resolve(path.dirname(file), specifier)
      : path.join(cwd, mapped(specifier, cwd));
    const target = EXTENSIONS.map((extension) => base + extension).find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    );
    if (target) found.push(target);
  }
  return found;
}

export function compileCSS(options: CompilerOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const sources = options.sources ?? {};
  const list = new Set(files(options));
  for (const file of Object.keys(sources)) list.add(path.resolve(cwd, file));
  for (const file of list) {
    const source =
      sources[file] ??
      (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
    for (const dependency of imported(file, source, cwd)) list.add(dependency);
  }
  const sent = [];
  for (const file of list) {
    const given = options.files?.some(
      (listed) => path.resolve(cwd, listed) === file,
    );
    const source =
      sources[file] ??
      (fs.existsSync(file) || given ? fs.readFileSync(file, 'utf8') : null);
    if (
      source === null ||
      !(
        RELEVANT.test(source) ||
        oxide.needsCompile(
          source,
          options.styleProp ?? DEFAULT_STYLE_PROP,
          file,
        )
      )
    )
      continue;
    sent.push({ path: file, source });
  }
  return oxide.compileCss({ root: cwd, files: sent, ...policyOf(options) });
}

export async function transformSource(
  env: TransformEnv,
): Promise<{ code: string; dependencies: string[] }> {
  const code = oxide.transform(env.source, env.filePath, {
    root: env.root ?? env.cwd ?? process.cwd(),
    styleProp: env.styleProp ?? DEFAULT_STYLE_PROP,
    ...(env.classProp
      ? { classProp: env.classProp as 'className' | 'class' }
      : {}),
    ...policyOf(env),
  });
  if (code !== null) {
    compileCSS({
      cwd: env.root ?? env.cwd ?? path.dirname(env.filePath),
      files: [env.filePath],
      sources: { [env.filePath]: env.source },
      ...policyOf(env),
    });
  }
  return { code: code ?? env.source, dependencies: [] };
}

const unsupported =
  (name: string) =>
  (..._args: unknown[]): never => {
    throw new Error(`oxide does not expose ${name}`);
  };

export const implementations = [
  {
    name: 'oxide',
    transformSource,
    compileCSS,
    optimizer: oxide.optimizer,
    getStyleRecords: oxide.getStyleRecords,
    needsCompile: oxide.needsCompile,
    resolveExport: unsupported('resolveExport'),
    resolveExportValue: oxide.resolveExportValue,
    resolveImportPath: oxide.resolveImportPath,
    resolvePropertyPolicy: oxide.resolvePropertyPolicy,
    createTheme: oxide.createTheme,
    themeHashOf: oxide.themeHashOf,
    scanAll: unsupported('scanAll'),
  },
];

export const getStyleRecords = oxide.getStyleRecords;

export function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  const result = Object.assign(Object.create(null), target);
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (
      val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      result[key] &&
      typeof result[key] === 'object'
    ) {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// Plumeria writes the merged class list into the code; typedcss leaves it to
// the @typedcss/css runtime, so tests read it by running the module.
let runtimeExports: Record<string, unknown> | undefined;
export function runtime(): Record<string, unknown> {
  if (runtimeExports) return runtimeExports;
  const file = path.join(__dirname, '../../css/lib/props.mjs');
  const module = { exports: {} as Record<string, unknown> };
  new Function(
    'module',
    'exports',
    'require',
    swc.transformSync(fs.readFileSync(file, 'utf8'), {
      module: { type: 'commonjs' },
    }).code,
  )(module, module.exports, createRequire(file));
  return (runtimeExports = module.exports);
}

export type Rendered = { type: unknown; props: Record<string, any> };

export function evaluateModule(
  code: string,
  filePath?: string,
  load?: (name: string) => unknown,
): Record<string, any> {
  const compiled = swc.transformSync(code, {
    filename: filePath ?? 'module.tsx',
    jsc: {
      parser: { syntax: 'typescript', tsx: true },
      transform: { react: { runtime: 'classic' } },
    },
    module: { type: 'commonjs' },
  }).code;
  const exports: Record<string, any> = {};
  const React = {
    createElement: (
      type: unknown,
      props: Record<string, any> | null,
      ...children: unknown[]
    ): Rendered => ({
      type,
      props: {
        ...(props ?? {}),
        ...(children.length
          ? { children: children.length === 1 ? children[0] : children }
          : {}),
      },
    }),
    Fragment: 'fragment',
    memo: (component: unknown) => component,
    forwardRef:
      (render: (props: unknown, ref: unknown) => unknown) => (props: unknown) =>
        render(props, null),
  };
  new Function('React', 'exports', 'require', compiled)(
    React,
    exports,
    (name: string) => {
      if (name === '@typedcss/css') return runtime();
      if (name === 'react') return React;
      const loaded = load?.(name);
      return loaded ?? require(name);
    },
  );
  return exports;
}

export function hostElement(node: unknown): Rendered | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const element = node as Rendered;
  if (typeof element.type === 'string' && element.type !== 'fragment')
    return element;
  if (typeof element.type === 'function')
    return hostElement((element.type as any)(element.props));
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = hostElement(child);
    if (found) return found;
  }
  return undefined;
}

const call = (value: unknown, props: Record<string, unknown>) =>
  typeof value === 'function' ? value(props) : value;

export function renderProps(
  code: string,
  props: Record<string, unknown> = {},
  name = 'A',
  load?: (name: string) => unknown,
): Record<string, any> {
  return (
    hostElement(call(evaluateModule(code, undefined, load)[name], props))
      ?.props ?? {}
  );
}

export function renderClass(
  code: string,
  props: Record<string, unknown> = {},
  name = 'A',
  load?: (name: string) => unknown,
): string {
  const element = hostElement(
    call(evaluateModule(code, undefined, load)[name], props),
  );
  return String(element?.props.className ?? element?.props.class ?? '');
}

// Links transformed modules to each other by their relative imports, so a
// parent can be rendered through the components it imports.
export function loadProject(
  codes: Record<string, string>,
): (file: string) => Record<string, any> {
  const loaded = new Map<string, Record<string, any>>();
  const find = (from: string, specifier: string) => {
    const base = path.resolve(path.dirname(from), specifier);
    return EXTENSIONS.map((extension) => base + extension).find(
      (candidate) => candidate in codes,
    );
  };
  const load = (file: string): Record<string, any> => {
    const cached = loaded.get(file);
    if (cached) return cached;
    const exports = evaluateModule(codes[file], file, (name) => {
      const target = name.startsWith('.') ? find(file, name) : undefined;
      return target ? load(target) : undefined;
    });
    loaded.set(file, exports);
    return exports;
  };
  return load;
}

export function childClasses(element: unknown): string[] {
  const children = (element as Rendered).props.children;
  return (Array.isArray(children) ? children : [children]).map((child) => {
    const host = hostElement(child);
    return String(host?.props.className ?? host?.props.class ?? '');
  });
}
