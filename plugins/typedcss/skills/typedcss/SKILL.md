---
name: typedcss
description: Write, review, and fix styles with TypedCSS (@typedcss/css) — css.create, the sx prop, selector rules, and compiler setup for Next.js, Vite, and other bundlers. Use whenever a project depends on @typedcss/css or the task touches TypedCSS styles.
---

<!-- Generated from docs/public/docs/ai.md by scripts/build-skill.js. Do not edit. -->

Before changing bundler or framework configuration, read https://typedcss.dev/docs/installation and the matching integration guide.

This document is for AI assistants (Claude, Gemini, ChatGPT, and others) generating code with TypedCSS. When writing TypedCSS code, **always** follow the rules and patterns described here.

Write TypedCSS code with `@typedcss/eslint-plugin` enabled (`typedcss.configs.recommended`), and resolve every warning it reports.

## Critical Rules (Quick Reference)

The complete rule set, distilled. Each rule is explained with examples in the sections below.

**MUST:**

- Call `css.create()` at module top level, never inside a component. (→ Forbidden Patterns)
- Bind styles with the `sx` prop, not `className`. (→ Mental Model)
- Import `@typedcss/css` in every file that uses TypedCSS styles, including files that only consume imported styles. It is required in a file that passes a style to a component through a prop other than `sx`, and safe and fastest everywhere else. (→ Core Usage)
- Start nested selector keys with `:` (pseudo) or `[` (attribute). (→ Selector Rules)
- Explicitly declare a compound selector when simultaneous pseudo-class states set the same property. (→ Selector Rules)
- Compose with arrays; the right side always wins. (→ Core Usage)

**NEVER:**

- Pass a raw object to `sx`, e.g. `sx={{ color: 'red' }}`. (→ Forbidden Patterns)
- Call `css.create()` inside a component body. (→ Forbidden Patterns)
- Use the `&` self-reference character. (→ Selector Rules)
- Use a combinator (`>`, `+`, `~`, a space) outside a functional pseudo-class. For parent-state or descendant styling, reach for `css.marker()` / `css.extended()` first. (→ Selector Rules, references/advanced-apis.md)
- Use class-name keys such as `.title` — style child elements directly. (→ Selector Rules)
- Nest a pseudo-selector inside another pseudo-selector — write `':hover::before'` as one key. (→ Selector Rules)
- Nest a media/container query inside a pseudo-selector. The reverse (pseudo inside media) is allowed once. (→ Selector Rules)
- Mix `className` and `sx` on the same element. (→ Forbidden Patterns)
- Merge `css.props()` output with the inline `style` prop. (→ Dynamic Styling)


- Join `css.props()` output with other class names, including another `css.props()` result passed through `className`, or pass it to a function such as `clsx` or `css.props()`. Pass every style to one `css.props()` call. (→ Forbidden Patterns)
- Read a definition from a namespace import by string key, destructuring or a rest element, or pass the namespace as a whole. Read it by name, as in `tokens.blue`. (→ Forbidden Patterns)
- Read a definition in an argument to a function key. Read it inside `css.create()`. (→ Dynamic Styling)

## Mental Model

- `css.create()` is compiled at build time into runtime class maps; CSS is extracted into a stylesheet.
- `sx` on an element compiles to a spread of `css.props(...)`, which merges styles at runtime and supplies `className` and any CSS variables on `style`.
- Compose arrays with right-wins precedence. Style values can pass through props, context, variables, and other packages before reaching an element.
- Style definitions and `sx` expressions must be statically resolvable, as in Plumeria, and the build stops when they are not. Once defined, a `css.Style` value can pass through any number of components and is merged by property key on the element that renders it.

## Core Usage

Define styles at module top level with `css.create()`, bind them with `sx`:

```tsx
import * as css from '@typedcss/css';

const styles = css.create({
  container: {
    display: 'flex',
    padding: '16px',
  },
  active: {
    backgroundColor: 'blue',
  },
});

export const MyComponent = ({ isActive }) => {
  return (
    <div sx={[styles.container, isActive && styles.active]}>
      Hello TypedCSS
    </div>
  );
};
```

**Right-wins composition.** `sx` accepts arrays, ternaries, and conditional expressions. The right-most style always takes precedence: above, `styles.active` overrides `styles.container` when `isActive` is true. `css.props()` follows the same rule. Within a single style, do not rely on source order to resolve overlapping pseudo-class states; declare their compound selector explicitly (see Selector Rules).

**Cross-file imports.** Import compiled styles from other files as runtime values. Keep `@typedcss/css` imported in files using `sx` so the integration can process them.

**Definitions from a package.** Share compiled class maps as runtime exports.

**Components from a package.** Pass `css.Style` through props and merge it on the element with `sx` or `css.props()`.

**Runtime imports.** Imports of compiled class maps and runtime helpers remain when used.

## Forbidden Patterns

Never generate these patterns. They break static analysis or cause runtime errors.

**Passing an object directly to `sx`:**

```tsx
<span sx={{ fontSize: '12px' }}>Small Text</span>
```

**Creating styles inside a component body:**

```tsx
export const BadComponent = ({ dynamicColor }) => {
  const dynamicStyles = css.create({
    dynamic: {
      color: dynamicColor,
    },
  });
  // ...
};
```

**Mixing `className` and `sx` on the same element:**

```tsx
<span className="global-class" sx={styles.base}>Text</span>
```

**Joining `css.props()` output with other class names:**

```tsx
// Box.tsx
export const Box = ({ className }: { className?: string }) => (
  <div className={css.props(styles.base) + ' ' + className} />
);

// Parent.tsx
<Box className={css.props(styles.blue)} />
```

Strings from separate calls are not merged, so which rule wins depends on stylesheet order. Receive a `css.Style` prop and pass it to the same call instead, e.g. `css.props(styles.base, style)`. (→ references/custom-components.md)

**Reading a definition from a namespace import by anything but its name:**

```tsx
import * as tokens from './tokens';

const { styles } = tokens;

<div sx={tokens['styles'].card} />
```

Every use of a definition is written in place at build time, so the compiler has to see which one is read. `tokens.styles.card` compiles as `import { styles } from './tokens'` does. A string key, destructuring, a rest element or passing `tokens` as a whole stops the build.

**Complex JS expressions in style values.** Only simple ternary operators are allowed, and only when necessary. Never put complex logic or function calls inside style values.

## Selector Rules

TypedCSS supports nesting for pseudo-classes, pseudo-elements, and attribute selectors — under strict rules:

- **NO `&`.** TypedCSS does not use the `&` self-reference character.
- **Nested keys MUST start with `:` or `[`.** Pseudo-classes/elements start with `:`; attribute selectors start with `[`.
- **Combinators only inside a functional pseudo-class.** `>`, `+`, `~` and the descendant space are rejected anywhere else. `:has()`, `:is()` and `:where()` are accepted, and a combinator inside one (e.g. `':has(> img)'`) is the escape hatch for markup you do not write. For parent-state or descendant styling, prefer the paired `css.marker()` / `css.extended()` APIs (see references/advanced-apis.md): they name no DOM path, so moving an element does not break them.
- **NO class-name keys.** Keys like `.title` are not supported. Apply TypedCSS styles directly to child elements instead.
- **NO pseudo inside pseudo.** Write a compound pseudo-selector as one key, e.g. `':hover::before'`.
- **NO same-name functional pseudo-class nesting, except `:not()`.** `':is(:where(:is(.a)))'` stops the build; different names can nest, and `':not(:not(.a), .b)'` is allowed. A key cannot nest parentheses deeper than 16 levels or hold a stray quote.
- **Declare overlapping states explicitly.** Pseudo-classes such as `:hover`, `:focus`, and `:active` can match simultaneously. When two states set the same property, declare their compound selector with the value the intersection should take. If they set different properties, no compound selector is needed. Functional pseudo-classes count too: `:nth-child(even)` and `:hover` setting the same property need the compound `':nth-child(even):hover'`.
- **Media/container query nesting is one-directional.** A pseudo-selector may be nested inside a media/container query exactly once. The reverse — a media/container query inside a pseudo-selector — is forbidden and causes compiler/type errors.

```tsx
const styles = css.create({
  button: {
    padding: '16px',
    backgroundColor: 'white',
    // VALID: Pseudo-classes and elements (starts with :)
    ':hover': {
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    },
    ':active': {
      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
    },
    // VALID: :hover and :active can match together; the intersection gets its own value
    ':hover:active': {
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    },
    '::before': {
      display: 'block',
      content: '""',
    },
    // VALID: Attribute selectors (starts with [)
    '[data-active="true"]': {
      borderColor: 'blue',
      borderStyle: 'solid',
      borderWidth: '2px',
    },
    // VALID: Pseudo-selector nested inside a media query (allowed once)
    '@media (max-width: 768px)': {
      padding: '8px',
      ':hover': {
        boxShadow: 'none',
      },
    },
  },
});

// INVALID: media query nested inside a pseudo-selector
const badStyles = css.create({
  button: {
    ':hover': {
      '@media (max-width: 768px)': {
        backgroundColor: 'blue',
      },
    },
  },
});
```

## Dynamic Styling

### Function keys

For dynamic values (which would normally require React's inline `style` prop), define a **function key** in `css.create()`. Function keys compile to CSS variables — so unlike inline styles, they fully support `@media` and `@container` queries:

```tsx
const styles = css.create({
  palette: (color: string) => ({
    backgroundColor: color,
    // Media/container queries work on dynamic styles
    '@media (max-width: 600px)': {
      backgroundColor: 'blue',
    },
  }),
});

// Usage: <div sx={styles.palette(color)} />
```

An argument reaches the output as written. A TypedCSS definition read there, as in `styles.palette(tokens.blue[500])`, is not compiled and has no value at runtime. Read it inside `css.create()` instead.

### Bracket notation (variants)

The `css.variants()` API has been removed in favor of standard bracket notation (`styles[variant]`). Bracket notation selects a compiled style map at runtime:

```tsx
import * as css from '@typedcss/css';

// 1. Define variants in a dedicated, minimal css.create()
const sizeStyles = css.create({
  small: {
    fontSize: '12px',
  },
  medium: {
    fontSize: '16px',
  },
  large: {
    fontSize: '20px',
  },
});

// 2. Type the variant (string literal union or keyof typeof)
type Size = keyof typeof sizeStyles;

interface ButtonProps {
  size: Size;
  children: React.ReactNode;
}

// 3. Resolve dynamically with bracket notation
export const Button = ({ size, children }: ButtonProps) => {
  return <button sx={sizeStyles[size]}>{children}</button>;
};
```

Best practices:

- **Keep variants focused.** Group related variants for clarity. Bracket notation selects their runtime class maps.
- **Variant keys are selector-parsed: no spaces.** Every key in a `css.create()` — a variant key included — is read as a selector, so a key must not contain a space or combinator characters; a space is a descendant combinator and stops the build (`no-combinator`). When a display label contains a space, use a slug key and keep a label map for rendering: e.g. the status "On leave" becomes the key `onLeave`, with `const statusLabels = { active: 'Active', onLeave: 'On leave', offline: 'Offline' }`.
- **Local variable assignment is supported.** `const currentStyle = sizeStyles[size]; <div sx={currentStyle} />` works with runtime class maps.

### `css.props()` returns element props

`css.props()` merges class maps at runtime and returns `{ className, style }`. Spread the result onto an element. Function keys are supported: their CSS variables are passed through `style`. Prefer `sx` on elements; spread `css.props()` where an `sx` prop is not available.

## References

Read the matching file before working on:

- `references/advanced-apis.md` — `css.marker()` / `css.extended()`, `css.createStatic()`, `css.createTheme()`, `css.keyframes()`, `css.viewTransitionClass()`, `css.varType()`, `css.positionTry()`.
- `references/custom-components.md` — a component that accepts or forwards a `Style` prop.
- `references/tailwind-migration.md` — converting Tailwind classes, `tv()` or `twMerge()`.
- `references/testing.md` — writing or fixing tests for styled components.
- `references/toolchain.md` — setup, bundler or ESLint configuration, property order and formatting.

<!--
Adapted from Plumeria documentation, https://plumeria.dev/docs/ai
MIT License

Copyright (c) zss-labs contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->
