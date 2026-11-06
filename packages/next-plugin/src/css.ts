import { compileStylesheet, optionsOf } from './shared';
import type { LoaderContext } from './shared';
import { withPreviousGenerations } from './dev-bridge';

export default function typedcssCssLoader(this: LoaderContext): string {
  const options = optionsOf(this);
  const { css, found } = compileStylesheet(options);
  for (const file of found) this.addDependency(file);
  return withPreviousGenerations(options.root, css);
}
