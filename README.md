# TypedCSS

TypedCSS is the atomic CSS-in-JS dual model of [Plumeria](https://plumeria.dev) that delegates some of the compilation responsibilities to the runtime resolver.
It shares an API with Plumeria, so the migration cost is minimal.

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

export function App() {
  return <div sx={[styles.text, styles.active]} />;
}
```

**Compiled:**

```tsx
<div className="xhrr6ses xvbwmxqp" />
```

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

## Quick start

```sh
npx @typedcss/init
```

### Migrating

```sh
npx @plumeria/codemod migrate-to-typedcss
```

```sh
npx @typedcss/codemod migrate-to-plumeria
```

TypedCSS and Plumeria share every version number, and each package takes the same options as its Plumeria counterpart:

| TypedCSS                  | Plumeria                  |
| ------------------------- | ------------------------- |
| `@typedcss/codemod`       | `@plumeria/codemod`       |
| `@typedcss/css`           | `@plumeria/core`          |
| `@typedcss/eslint-plugin` | `@plumeria/eslint-plugin` |
| `@typedcss/init`          | `@plumeria/init`          |
| `@typedcss/next-plugin`   | `@plumeria/next-plugin`   |
| `@typedcss/oxide`         | `@plumeria/compiler`      |
| `@typedcss/swc-jest`      | `@plumeria/swc-jest`      |
| `@typedcss/unplugin`      | `@plumeria/unplugin`      |
| `@typedcss/wind`          | `@plumeria/wind`          |

Read [plumeria.dev/docs/typedcss](https://plumeria.dev/docs/typedcss) for what differs, and the Plumeria documentation for everything else.

## License

TypedCSS is [MIT licensed](https://github.com/zss-labs/typedcss/blob/main/LICENSE).
