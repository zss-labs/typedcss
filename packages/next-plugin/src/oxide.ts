import type * as Oxide from '@typedcss/oxide';

// Next bundles its loaders with Turbopack, which would trace every platform
// binding the native package might load and warn about each one it lacks.
export const oxide: typeof Oxide = require(
  /* turbopackIgnore: true */ '@typedcss/oxide',
);
