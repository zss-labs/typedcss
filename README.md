# TypedCSS

![License](https://img.shields.io/badge/License-MIT-10B981)
[![npm](https://img.shields.io/npm/v/@typedcss/css?color=10B981)](https://www.npmjs.com/package/@typedcss/css)
[![Tests](https://img.shields.io/github/actions/workflow/status/zss-labs/typedcss/tests.yml?logo=github&logoColor=white&label=tests&color=10B981)](https://github.com/zss-labs/typedcss/actions/workflows/tests.yml)
[![Codecov](https://img.shields.io/codecov/c/github/zss-labs/typedcss?logo=codecov&logoColor=white&color=6366F1)](https://app.codecov.io/gh/zss-labs/typedcss)

**TypedCSS** brings predictable overrides to React styling. When you combine styles in an array, the rightmost style wins for each property, regardless of import or load order. The compiler merges styles it can resolve at build time. For styles passed through props, context, a store, or another package, a small runtime resolver applies the same override rules when needed.

## Example

```tsx
import * as css from '@typedcss/css';

const styles = css.create({
  text: {
    fontSize: 12,
    color: 'gray',
  },
  active: {
    color: 'navy',
  },
});

function Label({ textStyle }: { textStyle: typeof styles.active }) {
  return <div sx={[styles.text, textStyle]}>Active</div>;
}

export function App() {
  return <Label textStyle={styles.active} />;
}
```

The label keeps the base font size of 12px and takes its navy color from the style passed by its parent.

**Generated CSS:**

```css
.xhrr6ses:not(#\#) {
  font-size: 12px;
}
.xuifcaas {
  color: gray;
}
.xvbwmxqp {
  color: navy;
}
```

When `sx` can be resolved statically, the merge is decided at build time and only the winning classes reach the element. When it cannot, `sx` falls back to `css.props`, which merges at runtime and returns `{ className, style }`.

## Installation

### Automatic setup

```sh
npx @typedcss/init
```

The CLI detects your bundler and package manager, asks about project preferences such as ESLint, and previews the changes before installing packages and writing configuration files.

### Manual setup

1. Install the runtime and types as a regular dependency.

   ```sh
   pnpm add @typedcss/css
   ```

2. Install the plugin for your bundler and follow its configuration guide.

   | Bundler                          | Install                             | Configure                                                   |
   | -------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
   | Next.js                          | `pnpm add -D @typedcss/next-plugin` | [Next.js guide](https://typedcss.dev/docs/integration/next) |
   | Vite, webpack, Rollup and others | `pnpm add -D @typedcss/unplugin`    | [Bundler guides](https://typedcss.dev/docs/integration)     |

3. Declare the `sx` prop in `typedcss.d.ts`.

   ```ts
   /// <reference types="@typedcss/css/sx" />
   ```

[Full installation guide](https://typedcss.dev/docs/installation) · [ESLint plugin](https://www.npmjs.com/package/@typedcss/eslint-plugin)

## Structure

Every package is released under the same version as Plumeria.

- `.github`
  - Contains workflows used by GitHub Actions.
  - Contains other templates.
- `examples`
  - Example applications using TypedCSS.
- `packages`
  - Contains the individual packages managed in the monorepo.
  - [codemod](https://github.com/zss-labs/typedcss/tree/main/packages/codemod)
  - [css](https://github.com/zss-labs/typedcss/tree/main/packages/css)
  - [eslint-plugin](https://github.com/zss-labs/typedcss/tree/main/packages/eslint-plugin)
  - [init](https://github.com/zss-labs/typedcss/tree/main/packages/init)
  - [next-plugin](https://github.com/zss-labs/typedcss/tree/main/packages/next-plugin)
  - [oxide](https://github.com/zss-labs/typedcss/tree/main/packages/oxide)
  - [swc-jest](https://github.com/zss-labs/typedcss/tree/main/packages/swc-jest)
  - [unplugin](https://github.com/zss-labs/typedcss/tree/main/packages/unplugin)
  - [wind](https://github.com/zss-labs/typedcss/tree/main/packages/wind)
- `plugins`
  - Contains the Claude Code plugin with the TypedCSS skill.
- `test-e2e`
  - Contains e2e tests built with Playwright, Next.js and Vite for final quality assurance.

## Contributing

We welcome contributions of all kinds — bug reports, feature ideas, pull requests.

[Contributing Guide](https://github.com/zss-labs/typedcss/blob/main/.github/CONTRIBUTING.md)

## Acknowledgements

- [Plumeria](https://plumeria.dev/) - for the API TypedCSS shares
- [React Native](https://reactnative.dev/docs/stylesheet) - for the shape of `StyleSheet.create`
- [React Native for Web](https://necolas.github.io/react-native-web/) - for generating atomic CSS from CSS-in-JS
- [StyleX](https://stylexjs.com/) - for the design philosophy and the runtime merge TypedCSS falls back to
- [Tailwind CSS](https://tailwindcss.com/) - for the design values `@typedcss/wind` carries

## License

TypedCSS is [MIT licensed](https://github.com/zss-labs/typedcss/blob/main/LICENSE).
