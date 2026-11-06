---
'@typedcss/css': major
'@typedcss/oxide': major
'@typedcss/next-plugin': major
'@typedcss/unplugin': major
'@typedcss/eslint-plugin': major
'@typedcss/swc-jest': major
'@typedcss/init': major
'@typedcss/codemod': major
'@typedcss/wind': major
---

- Feat: first release of typedcss, released under the same version as Plumeria 22.0.0
- Feat: `css.create` compiles to atomic CSS and class maps, and the `sx` prop and `css.props` merge them at runtime, property by property with the right side winning
- Feat: `@typedcss/oxide` resolves imports through tsconfig `paths` when no `aliases` option matches
- Feat: `withoutLogicalProperties` and `withoutPhysicalProperties` reject the other spelling at build time
- Update: `@typedcss/eslint-plugin` follows `@plumeria/eslint-plugin` without `no-style-prop-relay`, `no-use-in-jsx` and `custom-props-require-import`
- Feat: a dependency can ship components and definitions as source: when its `exports` point a `typedcss` condition at its TypeScript files, the Vite, webpack, Rspack and Next.js plugins resolve it to that source, compile it like an app file and collect its styles, and Vite leaves it out of pre-bundling
- Feat: `sourcePackages()` in `@typedcss/oxide` lists the dependencies that expose the `typedcss` condition, so every plugin reads the same list
- Feat: `@typedcss/wind` provides the Tailwind CSS v4 design tokens as `css.createStatic` values and `css.keyframes` names
- Feat: `init` writes `typedcss.d.ts` into `src/` when the project has one, so a tsconfig that includes only `src` reads it
- Feat: the `release-styles` codemod joins an `sx` list member it cannot name, such as a prop, as a class string
- Feat: `css.keyframes`, `css.viewTransitionClass`, `css.positionTry` and `css.varType` emit their CSS only when the name is used in `css.create`, read at runtime by a file the build compiles, or used by another emitted definition
