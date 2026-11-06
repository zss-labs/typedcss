import { RuleTester } from 'eslint';
import { formatProperties } from '../../src/rules/format-properties';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
  },
});

ruleTester.run('format-properties', formatProperties, {
  valid: [
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    display: 'flex'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({ empty: {} });`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    // display: 'flex',
    textAlign: 'center',
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    /* display: 'flex', */
    textAlign: 'center',
  }
});`,
    },
    // Without @typedcss/css import, should NOT trigger
    {
      code: `const styles = {
  testKey: { fontSize: 24 }
};`,
    },
    {
      code: `import * as css from 'other'; const styles = css.create({ s: { color: 'red' } });`,
    },
    {
      code: `import * as css from '@typedcss/css'; css.create(myVar);`,
    },
    {
      code: `import * as css from '@typedcss/css'; css.other({ s: { color: 'red' } });`,
    },
    {
      code: `import * as css from '@typedcss/css'; (function(){})()`,
    },
    {
      code: `import { create } from '@typedcss/css'; create(myVar);`,
    },
    {
      code: `import { "create" as c } from '@typedcss/css'; c({
  s: {
    color: 'red'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24, // comment
    display: 'flex'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css['create']({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    ...props,
    fontSize: 24
  }
});`,
    },
    {
      // Case with comment in the "between" space of noEmptyLines
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,

    /* not whitespace only */
    display: 'flex'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  [testKey]: {
    fontSize: 24
  }
});`,
    },
    {
      // Top-level spread in create
      code: `import * as css from '@typedcss/css'; const styles = css.create({ ...props });`,
    },
    {
      // Other import from @typedcss/css
      code: `import { use } from '@typedcss/css'; use({ s: { color: 'red' } });`,
    },
  ],
  invalid: [
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: { fontSize: 24, /* comment */ display: 'flex' }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      // Outer object is fixed, inner object is NOT fixed because of the comment
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24, /* comment */ display: 'flex'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: { fontSize: 24 }
});`,
      errors: [
        {
          messageId: 'mustBeMultiline',
        },
      ],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: { fontSize: 24, display: 'flex' }
});`,
      errors: [
        {
          messageId: 'mustBeMultiline',
        },
      ],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    display: 'flex'
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,

    display: 'flex',

    textAlign: 'center',
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }, { messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    display: 'flex',
    textAlign: 'center',
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    ':hover': { color: 'red' }
  }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    ':hover': {
      color: 'red'
    }
  }
});`,
    },
    {
      code: `import { create } from '@typedcss/css'; const styles = create({
  testKey: { fontSize: 24 }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import { create } from '@typedcss/css'; const styles = create({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import { keyframes } from '@typedcss/css'; const anim = keyframes({
  testKey: { fontSize: 24 }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import { keyframes } from '@typedcss/css'; const anim = keyframes({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const above = css.positionTry({ top: 0,
  left: 0 });`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import * as css from '@typedcss/css'; const above = css.positionTry({
  top: 0,
  left: 0
});`,
    },
    {
      code: `import { viewTransitionClass } from '@typedcss/css'; const vt = viewTransitionClass({
  testKey: { fontSize: 24 }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import { viewTransitionClass } from '@typedcss/css'; const vt = viewTransitionClass({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import plumeria from '@typedcss/css'; const styles = plumeria.create({
  testKey: { fontSize: 24 }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import plumeria from '@typedcss/css'; const styles = plumeria.create({
  testKey: {
    fontSize: 24
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: { fontSize: 24, }
});`,
      errors: [{ messageId: 'mustBeMultiline' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
  }
});`,
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,


    display: 'flex'
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    display: 'flex'
  }
});`,
    },
    {
      // Multiple invalid objects
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  a: { color: 'red' },
  b: { color: 'blue' }
});`,
      errors: [
        { messageId: 'mustBeMultiline' },
        { messageId: 'mustBeMultiline' },
      ],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  a: {
    color: 'red'
  },
  b: {
    color: 'blue'
  }
});`,
    },
    {
      // Tab character in empty line
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
\t
    display: 'flex'
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    display: 'flex'
  }
});`,
    },
    {
      // Spread element with empty line
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,

    ...props
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    fontSize: 24,
    ...props
  }
});`,
    },
    {
      // Mixed empty and normal lines to cover all branches in the second pass
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    prop1: 1,

    prop2: 2,
    prop3: 3
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    prop1: 1,
    prop2: 2,
    prop3: 3
  }
});`,
    },
    {
      // Mixed pure empty lines and commented empty lines to cover L155 false branch
      code: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    prop1: 1,

    prop2: 2,

    /* comment */
    prop3: 3
  }
});`,
      errors: [{ messageId: 'noEmptyLines' }],
      output: `import * as css from '@typedcss/css'; const styles = css.create({
  testKey: {
    prop1: 1,
    prop2: 2,

    /* comment */
    prop3: 3
  }
});`,
    },
  ],
});
