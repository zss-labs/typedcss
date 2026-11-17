---
'@typedcss/unplugin': patch
'@typedcss/oxide': patch
---

- Fix: compile the stylesheet from the project files on disk, so it no longer depends on which module was transformed last and a deleted or emptied file leaves no stale CSS behind.
- Fix: stop a build with an error when a module that adds styles is outside the project root, under an excluded directory, or has no file on disk, instead of shipping its classes without their CSS.
- Fix: apply the `include` and `exclude` options to the stylesheet as well as to the transform.
- Fix: resolve and compile the stylesheet in a cached webpack or rspack build whose modules skipped the transform.
- Fix: read the build mode from the config Farm passes to the compiler hook so a production build is not switched back to development.
- Fix: reject a lone surrogate in a style key, value or template string in `@typedcss/oxide` instead of writing it into the CSS as an escape or dropping the key.
