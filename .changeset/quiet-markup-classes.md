---
'@typedcss/css': patch
'@typedcss/eslint-plugin': patch
'@typedcss/oxide': patch
---

- Fix: Avoid unresolved-composition warnings when embedding a class name in an HTML template.
- Fix: Reject dynamic style values that choose at runtime and inline style objects.
- Perf: Fold fully static same-file style compositions into class attributes.
- Perf: Order classes like the merged style object and cache merges across inline variables in css.props.
