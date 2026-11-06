import * as crypto from 'crypto';
import swcJest from '@swc/jest';
import * as oxide from '@typedcss/oxide';
import type { PropertyPolicyOptions } from '@typedcss/oxide';
import type { SyncTransformer, TransformOptions } from '@jest/transform';

type SwcOptions = NonNullable<Parameters<typeof swcJest.createTransformer>[0]>;

export interface TypedCSSJestOptions extends PropertyPolicyOptions {
  root?: string;
  styleProp?: string;
  swc?: SwcOptions;
}

const VERSION: string = require('../package.json').version;

export function createTransformer(
  options: TypedCSSJestOptions = {},
): SyncTransformer<TypedCSSJestOptions> {
  const { swc, ...rest } = options;
  const typedcss = { ...rest, root: rest.root ?? process.cwd() };
  const inner = swcJest.createTransformer(swc) as SyncTransformer;
  const prepare = (source: string, filename: string) =>
    filename.includes('node_modules')
      ? source
      : (oxide.transform(source, filename, typedcss) ?? source);
  return {
    canInstrument: inner.canInstrument,
    process(
      source: string,
      filename: string,
      transformOptions: TransformOptions,
    ) {
      return inner.process(
        prepare(source, filename),
        filename,
        transformOptions,
      );
    },
    getCacheKey(
      source: string,
      filename: string,
      transformOptions: TransformOptions,
    ) {
      const base =
        inner.getCacheKey?.(source, filename, transformOptions) ?? '';
      return crypto
        .createHash('sha1')
        .update(base)
        .update('\0')
        .update(VERSION)
        .update('\0')
        .update(JSON.stringify(typedcss))
        .digest('hex');
    },
  };
}

export default { createTransformer };
