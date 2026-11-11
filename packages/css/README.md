# @typedcss/css

**TypedCSS** is [Plumeria](https://plumeria.dev) with the merge moved to runtime. You write the same `css.create` and the same `sx` prop, and the compiler still turns every style into atomic CSS. What changes is who picks the winning class: a small resolver on the element, instead of the compiler at the call site.

That lets a style travel anywhere a value can — through props, context, or another package — at the price of a small runtime and a class map in the bundle. Plumeria is the recommendation for a new project; TypedCSS gives more room when refactoring an existing one.

## Quick start

```sh
npx @typedcss/init
```

## Example

`css.props` merges at runtime and returns `{ className, style }`, ready to spread onto any element. It is the counterpart of Plumeria's `css.use`; the `sx` prop works the same on both.

```tsx
import * as css from '@typedcss/css';

const styles = css.create({
  text: {
    fontSize: 14,
  },
  color: {
    color: 'aqua',
  },
});

export function Component({ isActive }: { isActive: boolean }) {
  return (
    <button {...css.props(styles.text, isActive && styles.color)}>
      text
    </button>
  );
}
```

## Migrating

The same source runs on either, and a codemod moves a project in each direction. From Plumeria to TypedCSS:

```sh
npx @plumeria/codemod migrate-to-typedcss
```

From TypedCSS to Plumeria:

```sh
npx @typedcss/codemod migrate-to-plumeria
```

## Packages

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
