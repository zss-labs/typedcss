import { RuleTester } from 'eslint';
import { noInnerCall } from '../../src/rules/no-inner-call';

const ruleTester = new RuleTester();

const settings = {
  ecmaVersion: 2021,
};

ruleTester.run('no-inner-call', noInnerCall, {
  valid: [
    {
      code: "import { variants as legacy } from '@typedcss/css'; function f() { legacy({}); }",
    },

    // Retired APIs are outside this rule; do not suggest using them differently.
    {
      code: `import * as css from '@typedcss/css'; const func = function() { css.variants(); };`,
    },

    {
      code: `import * as css from '@typedcss/css'; css.create();`,
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; css.createStatic();`,
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; css.createTheme();`,
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; css.keyframes();`,
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; css.viewTransitionClass();`,
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; css.variants();`,
      settings,
    },
    {
      code: `import css from '@typedcss/css'; css.create();`,
      settings,
    },
    {
      code: `import * as React from 'react'; function f() { React.useState(); }`,
      settings,
    },
    {
      code: `import { useState } from 'react'; function f() { useState(); }`,
      settings,
    },
    {
      code: `function f() { console.log(); }`,
      settings,
    },
    {
      code: `function f() { foo.bar.baz(); }`,
      settings,
    },
  ],
  invalid: [
    {
      code: `import * as css from '@typedcss/css'; const create = () => { css.create(); }`,
      errors: [{ message: 'Do not use css.create inside functions' }],
      settings,
    },
    {
      code: `import css from '@typedcss/css'; function f() { css.create(); }`,
      errors: [{ message: 'Do not use css.create inside functions' }],
      settings,
    },
    {
      code: `import { "create" as c } from '@typedcss/css'; function f() { c(); }`,
      errors: [{ message: 'Do not use c inside functions' }],
      settings,
    },
    {
      code: `import { create } from '@typedcss/css'; function f() { create(); }`,
      errors: [{ message: 'Do not use create inside functions' }],
      settings,
    },
    {
      code: `import * as style from '@typedcss/css'; function f() { style.create(); }`,
      errors: [{ message: 'Do not use style.create inside functions' }],
      settings,
    },
    {
      code: `import { keyframes } from '@typedcss/css'; (() => { keyframes(); })();`,
      errors: [{ message: 'Do not use keyframes inside functions' }],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; (() => { css.viewTransitionClass(); })();`,
      errors: [
        { message: 'Do not use css.viewTransitionClass inside functions' },
      ],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; (() => { css.positionTry({ top: 0 }); })();`,
      errors: [{ message: 'Do not use css.positionTry inside functions' }],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; (() => { css.varType({ syntax: '*' }); })();`,
      errors: [{ message: 'Do not use css.varType inside functions' }],
      settings,
    },
    {
      code: `import { createStatic } from '@typedcss/css'; function consts() { createStatic(); }`,
      errors: [{ message: 'Do not use createStatic inside functions' }],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; function theme() { css.createTheme(); }`,
      errors: [{ message: 'Do not use css.createTheme inside functions' }],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; const arrow = () => { css.keyframes(); };`,
      errors: [{ message: 'Do not use css.keyframes inside functions' }],
      settings,
    },
    {
      code: `import * as css from '@typedcss/css'; const func = function() { css.create(); };`,
      errors: [{ message: 'Do not use css.create inside functions' }],
      settings,
    },
  ],
});
