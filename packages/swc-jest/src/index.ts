import * as crypto from 'crypto';
import swcJest from '@swc/jest';
import * as oxide from '@typedcss/oxide';
import type { PropertyPolicyOptions } from '@typedcss/oxide';

type SwcOptions = NonNullable<Parameters<typeof swcJest.createTransformer>[0]>;
type SwcTransformer = ReturnType<typeof swcJest.createTransformer>;
type SyncSwcTransformer = SwcTransformer &
  Required<Pick<SwcTransformer, 'process'>>;

export interface TypedCSSJestOptions extends PropertyPolicyOptions {
  root?: string;
  styleProp?: string;
  swc?: SwcOptions;
}

const VERSION: string = require('../package.json').version;

export function createTransformer(
  options: TypedCSSJestOptions = {},
): SyncSwcTransformer {
  const { swc, ...rest } = options;
  const typedcss = { ...rest, root: rest.root ?? process.cwd() };
  const inner = swcJest.createTransformer(swc) as SyncSwcTransformer;
  const prepare = (source: string, filename: string) =>
    filename.includes('node_modules')
      ? source
      : (oxide.transform(source, filename, typedcss) ?? source);
  return {
    canInstrument: inner.canInstrument,
    process(
      ...[source, filename, transformOptions]: Parameters<
        SyncSwcTransformer['process']
      >
    ) {
      return inner.process(
        prepare(source, filename),
        filename,
        transformOptions,
      );
    },
    getCacheKey(
      ...[source, filename, transformOptions]: Parameters<
        NonNullable<SwcTransformer['getCacheKey']>
      >
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
