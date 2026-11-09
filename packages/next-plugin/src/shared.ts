import * as fs from 'fs';
import * as path from 'path';
import { oxide } from './oxide';
import type {
  PropertyPolicyOptions,
  SourcePackage,
  StyleFile,
} from '@typedcss/oxide';
import { inSourcePackage as inPackage } from 'zss-engine';

export const PACKAGE = '@typedcss/css';
export const DEFAULT_STYLE_PROP = 'sx';
export const VIRTUAL_FILE_PATH = path.resolve(
  __dirname,
  '..',
  'zero-virtual.css',
);

const INCLUDE = ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'];
const EXCLUDE = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
];
const REEXPORT = /export\s*(\*|\{[^}]*\})\s*from/;

export interface TypedCSSOptions extends PropertyPolicyOptions {
  root?: string;
  cwd?: string;
  styleProp?: string;
  include?: string[];
  exclude?: string[];
}

export interface ResolvedOptions extends PropertyPolicyOptions {
  cwd: string;
  root: string;
  styleProp: string;
  include: string[];
  exclude: string[];
}

export interface LoaderContext {
  resourcePath: string;
  addDependency: (file: string) => void;
  getOptions?: () => TypedCSSOptions | undefined;
  query?: TypedCSSOptions | string;
}

export function optionsOf(context: LoaderContext): ResolvedOptions {
  const options =
    context.getOptions?.() ??
    (typeof context.query === 'object' ? context.query : undefined) ??
    {};
  const cwd = options.cwd ?? process.cwd();
  return {
    cwd,
    root: options.root ?? cwd,
    styleProp: options.styleProp ?? DEFAULT_STYLE_PROP,
    include: options.include ?? INCLUDE,
    exclude: options.exclude ?? EXCLUDE,
    withoutLogicalProperties: options.withoutLogicalProperties,
    withoutPhysicalProperties: options.withoutPhysicalProperties,
  };
}

// Dependencies that point the typedcss condition at their source, read once per
// root; next.config reads them again when the dev server restarts.
const packagesByRoot = new Map<string, SourcePackage[]>();

export function sourcePackagesOf(root: string): SourcePackage[] {
  let packages = packagesByRoot.get(root);
  if (!packages) {
    packages = oxide.sourcePackages(root);
    packagesByRoot.set(root, packages);
  }
  return packages;
}

export function inSourcePackage(root: string, file: string): boolean {
  return inPackage(sourcePackagesOf(root), path.resolve(file));
}

const BROAD_NODE_MODULES = new Set(['**/node_modules/**', 'node_modules/**']);

// A source package's files, found from the root so an exclude written for a
// path inside node_modules still applies; only the broad node_modules
// patterns, which would drop every package file, are left out.
function sourcePackageFiles(root: string, exclude: string[]): string[] {
  const include = sourcePackagesOf(root).flatMap((pkg) =>
    pkg.sourceDirs
      .filter((dir) => dir.startsWith(pkg.dir + path.sep))
      .map(
        (dir) =>
          `${path.relative(root, dir).replace(/\\/g, '/')}/${INCLUDE[0]}`,
      ),
  );
  if (include.length === 0) return [];
  const kept = exclude.filter((pattern) => !BROAD_NODE_MODULES.has(pattern));
  return oxide
    .globFiles(include, root, kept)
    .map((relative) => path.join(root, relative));
}

const seen = new Map<string, { mtime: number; relevant: boolean }>();

function modified(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function sourceFilesOf({
  cwd,
  root,
  include,
  exclude,
}: ResolvedOptions): Set<string> {
  const scanned = new Set(
    oxide
      .globFiles(include, cwd, exclude)
      .map((relative) => path.join(cwd, relative)),
  );
  for (const file of sourcePackageFiles(root, exclude)) scanned.add(file);
  return scanned;
}

function collect(options: ResolvedOptions, fresh: boolean) {
  const files: StyleFile[] = [];
  const found = new Set<string>();
  for (const file of sourceFilesOf(options)) {
    const mtime = modified(file);
    if (mtime === undefined) continue;
    found.add(file);
    const previous = seen.get(file);
    if (!fresh && previous && previous.mtime === mtime) {
      if (previous.relevant) files.push({ path: file });
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    const relevant =
      REEXPORT.test(source) ||
      oxide.needsCompile(source, options.styleProp, file);
    seen.set(file, { mtime, relevant });
    if (relevant) files.push({ path: file, source });
  }
  for (const file of seen.keys()) {
    if (!found.has(file)) seen.delete(file);
  }
  return { files, found };
}

// A fresh compile reads every file again instead of trusting a cached mtime.
export function compileStylesheet(options: ResolvedOptions, fresh = false) {
  const { files, found } = collect(options, fresh);
  try {
    return {
      css: oxide.compileCss({
        root: options.root,
        withoutLogicalProperties: options.withoutLogicalProperties,
        withoutPhysicalProperties: options.withoutPhysicalProperties,
        files,
      }),
      found,
    };
  } catch (error) {
    seen.clear();
    throw error;
  }
}

export function transform(
  source: string,
  file: string,
  options: ResolvedOptions,
) {
  return oxide.transform(source, file, options);
}
