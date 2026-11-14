## Styling Custom Components

Use `sx` on an element or accept a `css.Style` prop on a custom component. Styles merge at runtime on the element.

> **Core principle**: `Style` values are runtime class maps. They can pass through multiple component boundaries.

### Pattern 1: Direct `sx` inside the component

The component imports its own styles and applies them internally. Simplest pattern — fully self-contained:

```tsx
import React from 'react';
import * as css from '@typedcss/css';

const styles = css.create({
  button: {
    padding: '10px',
    color: '#fff',
    cursor: 'pointer',
    backgroundColor: 'navy',
    borderColor: 'currentColor',
    borderStyle: 'none',
    borderWidth: 'medium',
    borderRadius: '4px',
  },
});

export const Button = ({ children }: { children: React.ReactNode }) => {
  return (
    // The compiler transforms sx into a css.props() spread here
    <button sx={styles.button}>
      {children}
    </button>
  );
};

// Usage
<Button>Click me</Button>;
```

### Pattern 2: Passing a `Style` prop

A component can receive `css.Style` through `sx` or another prop, then apply it on an element or forward it to another component. Compose `[styles.text, styleArray]` so call-site styles override base styles.

```tsx
// --- Button.tsx ---
import React from 'react';
import * as css from '@typedcss/css';

type ButtonProps = {
  children: React.ReactNode;
  styleArray?: css.Style;
};

// base style
const styles = css.create({
  text: {
    fontSize: '12px',
  },
});

// Pass styleArray directly to the inner element's sx
export const Button = ({ children, styleArray }: ButtonProps) => {
  return <button sx={[styles.text, styleArray]}>{children}</button>;
};

// --- Usage (call site) ---
import * as css from '@typedcss/css';
import { Button } from './Button';

const styles = css.create({
  primary: {
    padding: '10px',
    color: '#fff',
    backgroundColor: 'navy',
  },
  text: {
    fontSize: '24px',
  },
});

// styleArray merges with the base styles at runtime
<Button styleArray={[styles.primary, styles.text]}>Click me</Button>;
```

### Not a pattern: `className={css.props(...)}` on your own element

NEVER resolve styles with `css.props()` to apply them to an element your component renders. `sx` does the same job, and it also carries function keys, which `css.props()` cannot. Pattern 1 or Pattern 2 covers every element you render:

```tsx
// INVALID: sx applies these to an element you render
<button className={css.props(styles.text, styleArray)}>{children}</button>

// VALID
<button sx={[styles.text, styleArray]}>{children}</button>
```

`css.props()` is for the places `sx` cannot reach: a third-party component whose props have no `Style` type, a class name prop with another name such as `overlayClassName`, and templates that are not JSX (Vue, Svelte, Astro). The opt-in `@typedcss/no-use-in-jsx` lint rule reports every `css.props()` in JSX for projects that never need those.

### Plumeria migration compatibility

TypedCSS supports relaying a received `css.Style` through props, context, variables, and other components. This is valid TypedCSS code.

If you plan to migrate to Plumeria, we recommend applying each received style on an element rendered by that component instead of forwarding it through wrappers. Plumeria requires this shape for static compilation. Treat this as a migration recommendation, not a TypedCSS restriction.

### Summary

| Pattern         | Compilation site     | Component's role             |
| --------------- | -------------------- | ---------------------------- |
| 1. Direct `sx`  | Inside the component | Self-contained styles        |
| 2. `Style` prop | Merged at runtime  | Receives and applies `Style` |

Applying a received style directly is recommended for Plumeria migration compatibility; forwarding it is supported in TypedCSS.
