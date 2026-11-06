import { RuleTester } from 'eslint';
import { noUnknownCssProperties } from '../../src/rules/no-unknown-css-properties';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
});

ruleTester.run('no-unknown-css-properties', noUnknownCssProperties, {
  valid: [
    {
      code: `import * as css from '@typedcss/css'; css.positionTry({ [getKey()]: 'top', ...other });`,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            backgroundColor: 'red',
            marginTop: '10px',
            '--custom-prop': 'blue',
            ':hover': {
              color: 'green'
            },
            '@media (min-width: 600px)': {
              padding: '20px'
            },
            '[disabled]': {
              opacity: 0.5
            }
          }
        });
      `,
    },
    {
      code: `
        import css from '@typedcss/css';
        const styles = css.create({
          main: {
            display: 'flex'
          }
        });
      `,
    },
    {
      code: `
        import { create } from '@typedcss/css';
        const styles = create({
          main: {
            color: 'red'
          }
        });
      `,
    },
    {
      code: `
        import { create as c } from '@typedcss/css';
        const styles = c({
          main: {
            color: 'red'
          }
        });
      `,
    },
    {
      code: `
        import css from '@typedcss/css';
        const styles = css['create']({
          main: {
            color: 'red'
          }
        });
      `,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const animation = css.keyframes({
          from: { opacity: 0 },
          to: { opacity: 1 }
        });
      `,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const transition = css.viewTransitionClass({
          group: { opacity: 0 },
          new: { opacity: 1 }
        });
      `,
    },
    {
      code: `
        import { keyframes } from '@typedcss/css';
        const animation = keyframes({
          from: { opacity: 0 }
        });
      `,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const above = css.positionTry({ positionArea: 'top', marginBottom: 8 });
      `,
    },
    {
      code: `
        import { positionTry } from '@typedcss/css';
        const fallback = positionTry({
          inset: 0,
          insetBlockStart: 0,
          placeSelf: 'center',
          minInlineSize: 100,
          maxHeight: 200,
          marginInlineEnd: 4,
          positionAnchor: '--anchor',
          ['positionArea']: 'bottom',
        });
      `,
    },
    {
      code: `
        import { viewTransitionClass as vt } from '@typedcss/css';
        const transition = vt({
          new: { opacity: 1 }
        });
      `,
    },
    {
      code: `
        import { create } from '@typedcss/css';
        const styles = create({
          main: {
            ...{},
            color: 'red'
          }
        });
      `,
    },
    {
      // Non-typedcss import
      code: `import * as other from 'other'; other.create({ main: { color: 'red' } });`,
    },
    {
      // String literal import name
      code: `import { "create" as c } from '@typedcss/css'; c({ main: { color: 'red' } });`,
    },
    {
      // Non-Identifier object in MemberExpression
      code: `import * as css from '@typedcss/css'; (function(){ return css; })().create({ main: { color: 'red' } });`,
    },
    {
      // Non-Identifier callee
      code: `import * as css from '@typedcss/css'; (function(){})()`,
    },
    {
      // Non-ObjectExpression argument and Spread element
      code: `import { create } from '@typedcss/css'; create(arg, { ...props, main: { color: 'red' } });`,
    },
    {
      // Literal key and non-property element in checkStyleObject
      code: `import { create } from '@typedcss/css'; create({ main: { 'background-color': 'red', [key]: 'blue', ['a' + 'b']: 'green' } });`,
    },
    {
      // Other import from @typedcss/css to cover alias lookup failure
      code: `import { use } from '@typedcss/css'; use({ s: { color: 'red' } });`,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            ['color']: 'red',
            ['backgroundColor']: 'blue'
          }
        });
      `,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            cornerShape: 'squircle',
            cornerTopLeftShape: 'bevel',
            interestDelay: '0.5s',
            viewTransitionScope: 'all',
            textDecorationInset: '0.1em',
            columnRuleInset: '4px',
            timelineTrigger: 'none',
            flowTolerance: 'normal'
          }
        });
      `,
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            WebkitLineClamp: 2,
            msTextSizeAdjust: '100%',
            gridGap: '8px'
          }
        });
      `,
    },
  ],
  invalid: [
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            voiceFamily: 'male',
            WebkitMarquee: 'auto'
          }
        });
      `,
      errors: [
        { messageId: 'unknownProperty', data: { name: 'voiceFamily' } },
        { messageId: 'unknownProperty', data: { name: 'WebkitMarquee' } },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            backgoundColor: 'red'
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'backgoundColor',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            unknownProp: 'value'
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'unknownProp',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            ':hover': {
              unkownInsidePseudo: 'value'
            }
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'unkownInsidePseudo',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            '[disabled]': {
              invalidInsideAttr: 'green'
            }
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'invalidInsideAttr',
          },
        },
      ],
    },
    {
      code: `
        import { create } from '@typedcss/css';
        const styles = create({
          main: {
            '& .child': {
              color: 'red'
            }
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownNestedProperty',
          data: {
            name: '& .child',
          },
        },
      ],
    },
    {
      code: `
        import { create } from '@typedcss/css';
        const styles = create({
          main: {
            '&:hover': 'red'
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: '&:hover',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const animation = css.keyframes({
          from: { '&:hover': { color: 'red' } }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: '&:hover',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const animation = css.keyframes({
          from: { unkownProp: '0' }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'unkownProp',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const transition = css.viewTransitionClass({
          new: { unkownProp: '0' }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'unkownProp',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const above = css.positionTry({
          color: 'red',
          padding: 4,
          '--gap': '8px',
          ':hover': { top: 0 },
          '@media (width > 600px)': { top: 0 },
        });
      `,
      errors: [
        { messageId: 'positionTryProperty', data: { name: 'color' } },
        { messageId: 'positionTryProperty', data: { name: 'padding' } },
        { messageId: 'positionTryProperty', data: { name: '--gap' } },
        { messageId: 'positionTryProperty', data: { name: ':hover' } },
        {
          messageId: 'positionTryProperty',
          data: { name: '@media (width > 600px)' },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const above = css.positionTry({ positionAre: 'top' });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'positionAre',
          },
        },
      ],
    },
    {
      code: `
        import * as css from '@typedcss/css';
        const styles = css.create({
          main: {
            ['unknownProp']: 'value'
          }
        });
      `,
      errors: [
        {
          messageId: 'unknownProperty',
          data: {
            name: 'unknownProp',
          },
        },
      ],
    },
  ],
});
