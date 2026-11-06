import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { oxide } from './oxide';
import { carryStylesheet } from './dev-bridge-client';
import { compileStylesheet } from './shared';
import type { ResolvedOptions } from './shared';

export const DEV_BRIDGE_ID = 'typedcss-dev-bridge';
export const DEV_BRIDGE_WINDOW_MS = 30_000;
const KEPT_GENERATIONS = 3;

const isDevelopment = () => process.env.NODE_ENV === 'development';

export const generationId = (css: string) =>
  crypto.createHash('sha1').update(css).digest('hex').slice(0, 16);

export const generationMarker = (css: string) =>
  `[data-typedcss-generation="${generationId(css)}"] { --typedcss-generation: 1; }`;

export const devGenerationsPath = (cwd: string) =>
  path.join(
    os.tmpdir(),
    'typedcss',
    `${crypto.createHash('sha1').update(cwd).digest('hex')}.json`,
  );

export function readGenerations(file: string): string[] {
  try {
    const stored: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return Array.isArray(stored)
      ? stored.filter((css): css is string => typeof css === 'string')
      : [];
  } catch {
    return [];
  }
}

export function withPreviousGenerations(cwd: string, css: string): string {
  if (!isDevelopment()) return css;
  const marked = `${css}\n${generationMarker(css)}`;
  const file = devGenerationsPath(cwd);
  const stored = readGenerations(file);
  if (stored[stored.length - 1] === marked) return stored.join('\n');
  const generations = [...stored, marked].slice(-KEPT_GENERATIONS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(generations), 'utf-8');
  return generations.join('\n');
}

const editedWithinWindow = (file: string) => {
  try {
    return Date.now() - fs.statSync(file).mtimeMs <= DEV_BRIDGE_WINDOW_MS;
  } catch {
    return false;
  }
};

const outputs = new Map<string, { digest: string; edited: boolean }>();

const outputEdited = (file: string, code: string) => {
  const digest = crypto.createHash('sha1').update(code).digest('hex');
  const previous = outputs.get(file);
  const edited =
    previous !== undefined && (previous.digest !== digest || previous.edited);
  outputs.set(file, { digest, edited });
  return edited;
};

export function devBridge(
  file: string,
  code: string,
  options: ResolvedOptions,
): string {
  if (!isDevelopment()) return '';
  if (!outputEdited(file, code) || !editedWithinWindow(file)) return '';
  try {
    const { css } = compileStylesheet(options);
    return `\n(${carryStylesheet})(${JSON.stringify(oxide.optimizer(css))}, ${JSON.stringify(generationId(css))}, ${JSON.stringify(DEV_BRIDGE_ID)});\n`;
  } catch {
    return '';
  }
}
