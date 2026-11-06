import * as path from 'path';
import {
  VIRTUAL_FILE_PATH,
  inSourcePackage,
  optionsOf,
  transform,
} from './shared';
import type { LoaderContext } from './shared';
import { devBridge } from './dev-bridge';

export default function typedcssLoader(
  this: LoaderContext,
  source: string,
): string {
  const options = optionsOf(this);
  if (
    this.resourcePath.includes('node_modules') &&
    !inSourcePackage(options.root, this.resourcePath)
  )
    return source;
  const code = transform(source, this.resourcePath, options);
  if (code === null) return source;
  let virtual = path
    .relative(path.dirname(this.resourcePath), VIRTUAL_FILE_PATH)
    .replace(/\\/g, '/');
  if (!virtual.startsWith('.')) virtual = './' + virtual;
  return `${code}\nimport ${JSON.stringify(virtual)};${devBridge(this.resourcePath, code, options)}`;
}
