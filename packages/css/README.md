# @typedcss/css

**TypedCSS** brings predictable overrides to React styling. When you combine styles in an array, the rightmost style wins for each property, regardless of import or load order. The compiler merges styles it can resolve at build time. For styles passed through props, context, a store, or another package, a small runtime resolver applies the same override rules when needed.

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

## API

### css.create()

Styles are defined as a map of rules. Pseudo-classes and media queries nest as blocks:

```tsx
import * as css from '@typedcss/css';

const styles = css.create({
  text: {
    fontSize: 12,
    color: 'gray',
    ':hover': {
      color: 'black',
    },
    '@media (min-width: 800px)': {
      fontSize: 14,
    },
  },
  active: {
    color: 'navy',
  },
});
```

### sx

Styles are applied with the `sx` prop. An array merges from left to right, and the rightmost style wins for each property:

```tsx
<div sx={[styles.text, isActive && styles.active]} />
```

A compiled style is a value, so it can be passed through props or context and applied where it lands:

```tsx
const Accent = createContext<css.Style | null>(null);

function Label({ textStyle }: { textStyle?: css.Style }) {
  const accent = useContext(Accent);
  return <div sx={[styles.text, accent, textStyle]}>Label</div>;
}
```

### css.props()

When `sx` cannot be resolved at build time, it falls back to `css.props`, which merges at runtime and returns `{ className, style }`. Call it directly where `sx` is not available:

```tsx
<div {...css.props(styles.text, isActive && styles.active)} />
```

TypedCSS shares [Plumeria](https://plumeria.dev)’s API. See [typedcss.dev](https://typedcss.dev/docs) for the rest of it.

## License

TypedCSS is [MIT licensed](https://github.com/zss-labs/typedcss/blob/main/LICENSE).
