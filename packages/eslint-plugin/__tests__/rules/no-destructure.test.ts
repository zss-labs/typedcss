import { RuleTester } from 'eslint';
import { noDestructure } from '../../src/rules/no-destructure';

const ruleTester = new RuleTester();

ruleTester.run('no-destructure', noDestructure, {
  valid: [
    {
      code: "import css from '@typedcss/css'; const { variants: legacy } = css;",
    },

    // Retired APIs are outside this rule; do not suggest using them differently.
    {
      code: `import * as css from '@typedcss/css'; const { variants } = css;`,
    },

    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({})`,
    },
    {
      code: `import * as css from '@typedcss/css'; css.props()`,
    },
    {
      code: `import * as css from '@typedcss/css'; const animate = css.keyframes({})`,
    },
    {
      code: `import * as css from '@typedcss/css'; const transitionName = css.viewTransitionClass({})`,
    },
    {
      code: `import * as css from '@typedcss/css'; const breakpoints = css.createStatic({})`,
    },
    {
      code: `import * as css from '@typedcss/css'; const tokens = css.createTheme({})`,
    },
    {
      code: `import css from '@typedcss/css'; const styles = css.create({})`,
    },
    {
      code: `import { "create" as c } from '@typedcss/css';`,
    },
    {
      code: `import { create } from '@typedcss/css';`,
    },
    // Branch coverages
    {
      code: `import * as css from 'other'; const { create } = css;`,
    },
    {
      code: `import * as css from '@typedcss/css'; const { create } = other;`,
    },
    {
      code: `import * as css from '@typedcss/css'; const { ...rest } = css;`,
      settings: { ecmaVersion: 2021 },
    },
    {
      code: `import * as css from '@typedcss/css'; const { ['create']: create } = css;`,
    },
    {
      code: `import * as css from '@typedcss/css'; const { someOtherThing } = css;`,
    },
  ],
  invalid: [
    {
      code: `import * as css from '@typedcss/css'; const { create } = css;`,
      errors: [
        {
          message:
            'Do not destructure "create" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { props } = css;`,
      errors: [
        {
          message:
            'Do not destructure "props" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { keyframes } = css;`,
      errors: [
        {
          message:
            'Do not destructure "keyframes" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { viewTransitionClass } = css;`,
      errors: [
        {
          message:
            'Do not destructure "viewTransitionClass" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { positionTry } = css;`,
      errors: [
        {
          message:
            'Do not destructure "positionTry" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { varType } = css;`,
      errors: [
        {
          message:
            'Do not destructure "varType" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { createStatic } = css;`,
      errors: [
        {
          message:
            'Do not destructure "createStatic" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { createTheme } = css;`,
      errors: [
        {
          message:
            'Do not destructure "createTheme" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import css from '@typedcss/css'; const { create } = css;`,
      errors: [
        {
          message:
            'Do not destructure "create" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as css from '@typedcss/css'; const { create, createStatic, createTheme, keyframes, props, variants } = css;`,
      errors: [
        {
          message:
            'Do not destructure "create" from "css". Use dot notation instead.',
        },
        {
          message:
            'Do not destructure "createStatic" from "css". Use dot notation instead.',
        },
        {
          message:
            'Do not destructure "createTheme" from "css". Use dot notation instead.',
        },
        {
          message:
            'Do not destructure "keyframes" from "css". Use dot notation instead.',
        },
        {
          message:
            'Do not destructure "props" from "css". Use dot notation instead.',
        },
      ],
    },
    {
      code: `import * as style from '@typedcss/css'; const { create } = style;`,
      errors: [
        {
          message:
            'Do not destructure "create" from "style". Use dot notation instead.',
        },
      ],
    },
  ],
});
