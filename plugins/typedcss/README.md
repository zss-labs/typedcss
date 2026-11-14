# TypedCSS

Teaches Claude the rules of [TypedCSS](https://typedcss.dev), a CSS-in-JS library that compiles styles to static CSS at build time. With the plugin installed, Claude writes, reviews, and fixes TypedCSS styles the way the compiler expects: `css.create()` at module top level, styles bound through the `sx` prop, composition with arrays, and the selector rules the compiler enforces.

## What it contains

One skill, `typedcss`, which Claude loads when a task touches TypedCSS styles or a project depends on `@typedcss/css`. You can also run it directly as `/typedcss:typedcss`.

The skill is generated from the official [AI.md](https://typedcss.dev/docs/ai.md) documentation by a script in the TypedCSS repository, and CI regenerates it whenever that documentation changes. The plugin version moves only when the skill changes, not with every TypedCSS release.

The plugin has no hooks, MCP servers, or scripts. It runs nothing, sends nothing, and fetches nothing on its own. The skill only points Claude to the public TypedCSS documentation at typedcss.dev when bundler or framework setup is involved.

## Install

```text
/plugin marketplace add zss-labs/typedcss
/plugin install typedcss@typedcss
```

## Icon

The icon is the TypedCSS logo, rendered from the SVG in `docs/app/icon.svg`.

## License

MIT
