# @typedcss/next-plugin

## 22.0.13

### Patch Changes

- 6bdc5fa: Bump version to 22.0.13
- Updated dependencies [6bdc5fa]
  - @typedcss/eslint-plugin@22.0.13
  - @typedcss/oxide@22.0.13

## 22.0.12

### Patch Changes

- dc1d2c7: Bump version to 22.0.12
- Updated dependencies [dc1d2c7]
- Updated dependencies [dc1d2c7]
  - @typedcss/eslint-plugin@22.0.12
  - @typedcss/oxide@22.0.12

## 22.0.11

### Patch Changes

- 3b898a6: Bump version to 22.0.11
- Updated dependencies [3b898a6]
- Updated dependencies [3b898a6]
  - @typedcss/oxide@22.0.11
  - @typedcss/eslint-plugin@22.0.11

## 22.0.10

### Patch Changes

- 0c4d106: Bump version to 22.0.10
- Updated dependencies [0c4d106]
- Updated dependencies [0c4d106]
  - @typedcss/oxide@22.0.10
  - @typedcss/eslint-plugin@22.0.10

## 22.0.9

### Patch Changes

- 7a81b51: Bump version to 22.0.9
- Updated dependencies [7a81b51]
  - @typedcss/eslint-plugin@22.0.9
  - @typedcss/oxide@22.0.9

## 22.0.8

### Patch Changes

- 39b4089: Bump version to 22.0.8
- Updated dependencies [39b4089]
  - @typedcss/eslint-plugin@22.0.8
  - @typedcss/oxide@22.0.8

## 22.0.7

### Patch Changes

- 93f641e: Bump version to 22.0.7
- Updated dependencies [93f641e]
- Updated dependencies [93f641e]
  - @typedcss/oxide@22.0.7
  - @typedcss/eslint-plugin@22.0.7

## 22.0.6

### Patch Changes

- d8a3ed1: Bump versino to 22.0.6
- Updated dependencies [d8a3ed1]
- Updated dependencies [d8a3ed1]
  - @typedcss/oxide@22.0.6
  - @typedcss/eslint-plugin@22.0.6

## 22.0.5

### Patch Changes

- 33ec629: Perf: css improvement cache in props.mjs
  Fix: next-plugin watch sources before compiling the stylesheet in css.ts
- Updated dependencies [33ec629]
  - @typedcss/eslint-plugin@22.0.5
  - @typedcss/oxide@22.0.5

## 22.0.4

### Patch Changes

- c7fc45a: Bump version to 22.0.4
- Updated dependencies [c7fc45a]
  - @typedcss/eslint-plugin@22.0.4
  - @typedcss/oxide@22.0.4

## 22.0.3

### Patch Changes

- 3dd8098: Update next version
- Updated dependencies [3dd8098]
  - @typedcss/eslint-plugin@22.0.3
  - @typedcss/oxide@22.0.3

## 22.0.2

### Patch Changes

- Updated dependencies [1a659fa]
  - @typedcss/oxide@22.0.1
  - @typedcss/eslint-plugin@22.0.2

## 21.2.7

### Patch Changes

- 83e304f: Bump version to 21.2.7
- Updated dependencies [83e304f]
- Updated dependencies [83e304f]
  - @typedcss/turbopack-loader@21.2.7
  - @typedcss/eslint-plugin@21.2.7

## 21.2.6

### Patch Changes

- d708d87: - Fix: resolve and compile component source from packages exposing the plumeria condition
  - Fix: full-reload when a prop-driven update reaches a module that cannot accept it
  - Fix: keep node_modules out of the lint guard
  - Feat: `sourcePackages()` in the compiler lists the packages exposing the plumeria condition, so the bundler plugins share the compiler's discovery instead of scanning dependencies themselves
- Updated dependencies [d708d87]
  - @typedcss/turbopack-loader@21.2.6
  - @typedcss/eslint-plugin@21.2.6

## 21.2.5

### Patch Changes

- 40fb1e0: Bump version to 21.2.5
- Updated dependencies [40fb1e0]
  - @typedcss/turbopack-loader@21.2.5
  - @typedcss/eslint-plugin@21.2.5

## 21.2.4

### Patch Changes

- 6c025b8: Bump version to 21.2.4
- Updated dependencies [6c025b8]
- Updated dependencies [6c025b8]
  - @typedcss/turbopack-loader@21.2.4
  - @typedcss/eslint-plugin@21.2.4

## 21.2.3

### Patch Changes

- 1f5ad12: Bump version to 21.2.3
- Updated dependencies [1f5ad12]
- Updated dependencies [1f5ad12]
  - @typedcss/turbopack-loader@21.2.3
  - @typedcss/eslint-plugin@21.2.3

## 21.2.2

### Patch Changes

- 30cfad5: Bump version to 21.2.2
- Updated dependencies [30cfad5]
  - @typedcss/eslint-plugin@21.2.2
  - @typedcss/turbopack-loader@21.2.2

## 21.2.1

### Patch Changes

- 2089b8a: Bump version to 21.2.1
- Updated dependencies [2089b8a]
  - @typedcss/eslint-plugin@21.2.1
  - @typedcss/turbopack-loader@21.2.1

## 21.2.0

### Minor Changes

- fb82771: - Feat: a package can share its Plumeria definitions as source: when its `exports` point a `plumeria` condition at its TypeScript files, as in `"plumeria": "./src/index.ts"`, an app that lists it in its dependencies reads the definitions it exports, such as `css.createStatic` values, `css.create` styles and `css.keyframes` names, as it reads a local module, including subpath and pattern exports and packages linked from a pnpm store
  - Feat: `@typedcss/wind` provides the Tailwind CSS v4.3.3 design tokens, such as the color palettes, spacing, type scale, radius, shadows and animations, as `css.createStatic` values; each value is compiled into the styles that read it, so the package adds nothing to the bundle
  - Feat: a definition read by name through a namespace import, such as `tokens.blue[500]` after `import * as tokens from './tokens'`, compiles as it does through `import { blue }`; a string key, destructuring, a rest element or the namespace passed as a whole still stops the build and asks for a named import
  - Fix: an import whose names are all compiled away, such as a `css.createStatic` import read only inside `css.create`, is removed from the output, so the bundler no longer resolves or loads that module; an import still read at runtime, rendered as a component or re-exported is kept
  - Fix: reading a module's exports before the first project scan, as `resolveExport` and `resolveExportValue` can, no longer leaves that module out of the scan
  - Fix: `no-combinator` checks only the `css.createStatic` values that start with `:` or `[`, the ones that become a selector when used as a key, so a value with spaces, such as a shadow or a font stack, is no longer reported
  - Update: `no-unknown-css-properties` accepts `fit-tolerance`, `min-size` and `max-size`, from the latest MDN and webref data

### Patch Changes

- Updated dependencies [fb82771]
  - @typedcss/eslint-plugin@21.2.0
  - @typedcss/turbopack-loader@21.2.0

## 21.1.8

### Patch Changes

- de2791a: Bump version to 21.1.8
- Updated dependencies [de2791a]
  - @typedcss/turbopack-loader@21.1.8
  - @typedcss/eslint-plugin@21.1.8

## 21.1.7

### Patch Changes

- 0f80855: - Fix: `no-unused-keys` treats any non-literal bracket key, such as `styles[item.kind]`, as dynamic access instead of reporting every key as unused
  - Fix: `no-unused-keys` recognizes dynamic access that appears before the `css.create` call, such as inside a hoisted function
- Updated dependencies [0f80855]
- Updated dependencies [0f80855]
  - @typedcss/turbopack-loader@21.1.7
  - @typedcss/eslint-plugin@21.1.7

## 21.1.6

### Patch Changes

- b94dcc8: - Fix: a dynamic style parameter inside a color, filter or scale function, such as `hsl()`, `brightness()` or `scaleX()`, no longer gets a `px` unit
- Updated dependencies [b94dcc8]
  - @typedcss/eslint-plugin@21.1.6
  - @typedcss/turbopack-loader@21.1.6

## 21.1.5

### Patch Changes

- 17a242d: - Fix: write `plumeria.d.ts` into `src/` when the project has one, so a tsconfig that includes only `src`, such as the Vite React template, reads the `classStyle` declaration
  - Fix: `expand-border-shorthands` writes the longhands in the order `sort-properties` expects, so a single `oxlint --fix` pass settles both rules
  - Fix: `sort-properties` keeps the trailing comma and moves each property's comments with it when it reorders an object
- Updated dependencies [17a242d]
- Updated dependencies [17a242d]
  - @typedcss/eslint-plugin@21.1.5
  - @typedcss/turbopack-loader@21.1.5

## 21.1.4

### Patch Changes

- f26493b: Bump version to 21.1.4
- Updated dependencies [f26493b]
  - @typedcss/eslint-plugin@21.1.4
  - @typedcss/turbopack-loader@21.1.4

## 21.1.3

### Patch Changes

- 2bf6c80: - Update: Move repository links to the zss-labs organization
- Updated dependencies [2bf6c80]
  - @typedcss/eslint-plugin@21.1.3
  - @typedcss/turbopack-loader@21.1.3

## 21.1.2

### Patch Changes

- f8bd21e: - Fix: a received style can be composed onto a component the build never scans, such as a `@typedcss/headlessui` part, with `classStyle={[styles.base, classStyle]}` instead of failing the build
  - Fix: passing a received style to a component that declares the style prop fails the build at that attribute, even when the same style is also applied to an element, instead of the style being silently dropped
  - Fix: `no-style-prop-relay` reports a received style passed to a component that declares the style prop, the same case the build stops at, including a component imported from another file
  - Fix: `no-order-dependent-overlap` no longer reports selectors that cannot match at the same time: the same attribute with different values, `:not([attr])` with `[attr=...]`, `:user-valid` with `:user-invalid`, `:playing` with `:paused`, `:dir(ltr)` with `:dir(rtl)`, and odd with even `:nth-*()`
  - Fix: `no-style-prop-relay` reports a file the editor opens under a path that differs from the real one, such as a different letter case on macOS
  - Update: Next.js in `@typedcss/next-plugin` devDependencies to 16.4.2
- Updated dependencies [f8bd21e]
  - @typedcss/eslint-plugin@21.1.2
  - @typedcss/turbopack-loader@21.1.2
