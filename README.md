# TypedCSS

TypedCSS is the atomic CSS-in-JS dual model of [Plumeria](https://plumeria.dev) that delegates some of the compilation responsibilities to the runtime resolver.
It shares an API with Plumeria, so the migration cost is minimal.

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
