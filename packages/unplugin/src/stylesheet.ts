import * as fs from 'fs';
import * as path from 'path';
import * as oxide from '@typedcss/oxide';
import type { PropertyPolicyOptions, StyleFile } from '@typedcss/oxide';

export const PACKAGE = '@typedcss/css';
export const DEFAULT_STYLE_PROP = 'sx';

const INCLUDE = ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'];
const EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
];
const REEXPORT = /export\s*(\*|\{[^}]*\})\s*from/;

export interface StylesheetOptions extends PropertyPolicyOptions {
  cwd: string;
  root: string;
  styleProp?: string;
  include?: string[];
  exclude?: string[];
  sourceDirs?: string[];
}

const BROAD_NODE_MODULES = new Set(['**/node_modules/**', 'node_modules/**']);

// A source package's files, found from the root so an exclude written for a
// path inside node_modules still applies; only the broad node_modules
// patterns, which would drop every package file, are left out.
function sourcePackageFiles(
  dirs: string[],
  root: string,
  exclude: string[],
): string[] {
  if (dirs.length === 0) return [];
  const include = dirs.map(
    (dir) => `${path.relative(root, dir).replace(/\\/g, '/')}/${INCLUDE[0]}`,
  );
  const kept = exclude.filter((pattern) => !BROAD_NODE_MODULES.has(pattern));
  return oxide
    .globFiles(include, root, kept)
    .map((relative) => path.join(root, relative));
}

const seen = new Map<string, { mtime: number; relevant: boolean }>();

export function isRelevant(
  source: string,
  file = '',
  styleProp = DEFAULT_STYLE_PROP,
): boolean {
  return REEXPORT.test(source) || oxide.needsCompile(source, styleProp, file);
}

function modified(file: string): number | undefined {
  try {
    return fs.statSync(file).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function collect(options: StylesheetOptions, overrides: Map<string, string>) {
  const files: StyleFile[] = [];
  const found: string[] = [];
  const present = new Set<string>();
  const exclude = options.exclude ?? EXCLUDE;
  const scanned = new Set(
    oxide
      .globFiles(options.include ?? INCLUDE, options.cwd, exclude)
      .map((relative) => path.join(options.cwd, relative)),
  );
  for (const file of sourcePackageFiles(
    options.sourceDirs ?? [],
    options.root,
    exclude,
  ))
    scanned.add(file);
  for (const file of scanned) {
    present.add(file);
    const override = overrides.get(file);
    if (override !== undefined) {
      const relevant = isRelevant(override, file, options.styleProp);
      seen.delete(file);
      if (relevant) {
        files.push({ path: file, source: override });
        found.push(file);
      }
      continue;
    }
    const mtime = modified(file);
    if (mtime === undefined) {
      present.delete(file);
      continue;
    }
    const previous = seen.get(file);
    if (previous && previous.mtime === mtime) {
      if (previous.relevant) {
        files.push({ path: file });
        found.push(file);
      }
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    const relevant = isRelevant(source, file, options.styleProp);
    seen.set(file, { mtime, relevant });
    if (relevant) {
      files.push({ path: file, source });
      found.push(file);
    }
  }
  for (const [file, source] of overrides) {
    if (present.has(file) || !isRelevant(source, file, options.styleProp))
      continue;
    files.push({ path: file, source });
    found.push(file);
  }
  for (const file of seen.keys()) {
    if (!present.has(file)) seen.delete(file);
  }
  return { files, found };
}

export function compileStylesheet(
  options: StylesheetOptions,
  overrides: Map<string, string> = new Map(),
): { css: string; files: string[] } {
  const { files, found } = collect(options, overrides);
  try {
    return {
      css: oxide.compileCss({
        root: options.root,
        withoutLogicalProperties: options.withoutLogicalProperties,
        withoutPhysicalProperties: options.withoutPhysicalProperties,
        files,
      }),
      files: found,
    };
  } catch (error) {
    seen.clear();
    throw error;
  }
}
