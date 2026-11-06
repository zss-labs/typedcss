# @typedcss/init

Sets typedcss up in a project that already exists. No install needed — run it
with `npx`.

```sh
npx @typedcss/init
```

It reads the project, asks what it cannot read, shows the plan, and only then
writes. Nothing is installed or patched before you say so.

```
✔ detected  next  pnpm  typescript

  ➡︎ install  @typedcss/css @typedcss/next-plugin @typedcss/eslint-plugin rimraf
  + write    typedcss.d.ts     sx
  ~ patch    next.config.ts    withTypedCSS(...)
  ~ patch    eslint.config.ts  typedcss.configs.recommended
  ~ patch    package.json      predev: rimraf .next, prebuild: rimraf .next
```

## What it detects

The package manager comes from `packageManager` or the lockfile, both looked for
upwards from the directory init runs in, so a package inside a workspace is
installed with the manager the workspace root uses. The bundler comes from the
dependencies, and from the config files when nothing is installed yet: `next`, `vite`, `astro`, `webpack`, `rspack`, `rollup`,
`rolldown`, `esbuild`, `farm` and `bun`. Pass `--bundler <name>` to decide it
yourself.

Next.js gets `@typedcss/next-plugin`; every other bundler gets
`@typedcss/unplugin` with the factory that matches it.

## What it asks

**Which spelling should lint enforce?** —
`marginBlockStart` or `marginTop`. The answer reaches both sides at once: the
bundler plugin gets `withoutLogicalProperties` or `withoutPhysicalProperties`,
so the counterpart cannot compile, and ESLint gets
`@typedcss/no-logical-properties` or `@typedcss/no-physical-properties`, so it
is reported while you type. Answering "none" sets neither. `--sizes` extends
the answer to the size axis, where `width` and `inlineSize` are the pair.

**Which JSX prop carries styles?** — `sx` by default. A renamed prop is
written into the plugin as `styleProp` and declared in `typedcss.d.ts`, so the
two cannot disagree. It has to be an identifier TypeScript can declare, and a
name React leaves free; `className`, `style`, `key`, `ref` and `children` are
refused, from the prompt and from `--style-prop` alike.

**Set up `@typedcss/eslint-plugin` for ESLint?** — adds the plugin and writes or
extends the flat config, so a style error is reported while you type. The build
lints either way: the bundler plugin runs the same rules alongside the build and
stops it on a style error. On esbuild and Bun, which the plugin cannot lint,
the `build` script is prefixed with `typedcss-lint --` instead.

## What it writes

- `typedcss.d.ts` — the styling prop TypeScript reads.
- the bundler config — the plugin, and the options the answers chose. An
  existing config is patched: the import lands after the last import, and the
  plugin joins the `plugins` array. A Next config has its default export
  wrapped in `withTypedCSS`.
- `eslint.config.ts` — `typedcss.configs.recommended` plus the rules that were
  asked for, and `settings.typedcss.styleProp` when the styling prop was renamed. An existing flat config is extended rather than replaced.
- `package.json` — on esbuild and Bun, `typedcss-lint --` in front of the `build`
  script, with `--style-prop` when the styling prop was renamed, and on Next.js `rimraf .next` before `dev` and before `build`, so a version change is
  not read as a compile error. A `pre` script is added only for a script the
  project actually has, and one it already wrote is left alone. Clearing the
  cache is a Next.js concern rather than a lint one, so `--no-eslint` keeps it.

What counts as already set up is the plugin being *called*, not merely imported.
A bare `typedcss.version`, and a call inside a comment, a string or a regex
literal, all read as not set up, because none of them registers anything; an import nothing
calls is completed rather than skipped, and the binding the file already named is
the one that gets called. An import spanning several lines is read as one
statement, so it is never duplicated. A second run writes nothing; a
half-finished one is finished.

The `plugins` array it extends is the one the config object owns — a `plugins`
belonging to a nested key, such as `test` for Vitest, is never written into.
Where the plugin cannot be placed safely — a config whose own object has no
`plugins` array, a build script rather than a config, a legacy `.eslintrc` —
nothing is touched and the snippet is printed instead.

## Options

```sh
npx @typedcss/init --dry-run            # show the plan, write nothing
npx @typedcss/init --yes                # take every default, ask nothing
npx @typedcss/init --physical --sizes   # answer the spelling question up front
npx @typedcss/init --style-prop classStyle
npx @typedcss/init --bundler rollup
npx @typedcss/init --no-eslint          # leave ESLint out
npx @typedcss/init --no-install         # write the configs, print the command
npx @typedcss/init --cwd packages/app
```

Without a TTY it never asks — every unanswered question takes its default,
which is what makes it usable in CI. Colour comes from `node:util`'s
`styleText`, which leaves the text alone when the output is not a terminal, so a
piped or logged run carries no escape codes.

Installed rather than fetched, the command is `typedcss-init`.

Commit before running, so the writes can be reverted with `git checkout`.
