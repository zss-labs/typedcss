import * as path from 'path';
import {
  type LintOverrides,
  startLintGuard,
} from '@typedcss/eslint-plugin/guard';

export function startNextLintGuard(
  overrides: LintOverrides = {},
  argv: string[] = process.argv,
): boolean {
  const [, bin = '', ...args] = argv;
  if (path.basename(bin) !== 'next' || !args.includes('build')) return false;
  return startLintGuard(overrides);
}
