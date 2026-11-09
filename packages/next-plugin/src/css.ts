import { compileStylesheet, optionsOf, sourceFilesOf } from './shared';
import type { LoaderContext } from './shared';
import {
  devGenerationsPath,
  readGenerations,
  withPreviousGenerations,
} from './dev-bridge';

interface CssLoaderContext extends LoaderContext {
  async: () => (error: Error | null, content?: string) => void;
  emitError?: (error: Error) => void;
}

export default function typedcssCssLoader(this: CssLoaderContext): void {
  const callback = this.async();
  const options = optionsOf(this);
  try {
    // Watch every source before reading any, so an edit made while the
    // stylesheet compiles still invalidates it.
    for (const file of sourceFilesOf(options)) this.addDependency(file);
    const { css } = compileStylesheet(options, true);
    callback(null, withPreviousGenerations(options.root, css));
  } catch (error) {
    if (process.env.NODE_ENV !== 'development' || !this.emitError) {
      return callback(error as Error);
    }
    this.emitError(error as Error);
    callback(
      null,
      readGenerations(devGenerationsPath(options.root)).join('\n'),
    );
  }
}
