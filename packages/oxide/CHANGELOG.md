# @typedcss/oxide

## 22.0.14

### Patch Changes

- 782cd61: - Fix: compile the stylesheet from the project files on disk, so it no longer depends on which module was transformed last and a deleted or emptied file leaves no stale CSS behind.
  - Fix: stop a build with an error when a module that adds styles is outside the project root, under an excluded directory, or has no file on disk, instead of shipping its classes without their CSS.
  - Fix: apply the `include` and `exclude` options to the stylesheet as well as to the transform.
  - Fix: resolve and compile the stylesheet in a cached webpack or rspack build whose modules skipped the transform.
  - Fix: read the build mode from the config Farm passes to the compiler hook so a production build is not switched back to development.
  - Fix: reject a lone surrogate in a style key, value or template string in `@typedcss/oxide` instead of writing it into the CSS as an escape or dropping the key.

## 22.0.13

### Patch Changes

- 6bdc5fa: Bump version to 22.0.13

## 22.0.12

### Patch Changes

- dc1d2c7: - Feat: Fold local conditions in sx and css.props into Plumeria's conflict lookup tables instead of the runtime merge.

## 22.0.11

### Patch Changes

- 3b898a6: Bump version to 22.0.11

## 22.0.10

### Patch Changes

- 0c4d106: Bump version to 22.0.10

## 22.0.9

### Patch Changes

- 7a81b51: - Fix: Avoid unresolved-composition warnings when embedding a class name in an HTML template.
  - Fix: Reject dynamic style values that choose at runtime and inline style objects.
  - Perf: Fold fully static same-file style compositions into class attributes.
  - Perf: Order classes like the merged style object and cache merges across inline variables in css.props.

## 22.0.8

### Patch Changes

- 39b4089: Bump version to 22.0.8

## 22.0.7

### Patch Changes

- 93f641e: Bump version to 22.0.7

## 22.0.6

### Patch Changes

- d8a3ed1: Update: SWC to OXC and improvement optimize

## 22.0.5

### Patch Changes

- 33ec629: Bump version to 22.0.5

## 22.0.4

### Patch Changes

- c7fc45a: Bump version to 22.0.4

## 22.0.3

### Patch Changes

- 3dd8098: Bump version to 22.0.3

## 22.0.2

### Patch Changes

- f4dea2b: Bump version to 22.0.2

## 22.0.1

### Patch Changes

- 1a659fa: Update: add OIDC
