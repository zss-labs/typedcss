import { RuleTester } from 'eslint';
import { noInlineObject } from '../../src/rules/no-inline-object';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run('no-inline-object', noInlineObject, {
  valid: [
    {
      code: "import * as css from '@typedcss/css'; css.variants({ size: { small: { color: 'red' } } });",
    },
    {
      code: "import { variants as legacy } from '@typedcss/css'; legacy({ size: { small: { color: 'red' } } });",
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ small: { color: 'red' }, large: { color: 'blue' } }); css.props(styles[size]);",
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ small: { color: 'red' }, large: { color: 'blue' } }); <div sx={styles[size]} />;",
    },

    // Retired APIs are outside this rule; do not suggest using them differently.
    {
      code: "import { variants } from '@typedcss/css'; const getStyle = variants({ variant: { style: { color:'red' } } });",
    },

    { code: '<div style={{ color: "red" }} />' },
    { code: '<div sx={styles.active} />' },
    { code: '<div sx={[styles.base, isActive && styles.active]} />' },
    { code: 'css.props(styles.active)' },
    { code: 'css.props(styles.base, isActive && styles.active)' },
    { code: '<div className={css.props(styles.active)} />' },
    { code: 'css.create({ text: { color: "red" } })' },
    { code: '<div sx={[variants({ size: "small" })]} />' },
    { code: 'css.props(variants({ size: "small" }))' },
    { code: 'foo()()' },
    { code: "import React from 'react';" },
    { code: 'obj.prop.props()' },
    { code: 'css["props"]()' },
    { code: '<div sx />' },
    { code: 'css.variants({ ...spread })' },
    { code: 'css.variants({ size: { ...spread } })' },
    { code: "import { props as myUse } from '@typedcss/css';" },
    {
      code: "import { 'props' as myUse } from '@typedcss/css'; myUse(styles.base);",
    },
    {
      code: "import { variants } from '@typedcss/css'; variants('not-an-object');",
    },
    {
      code: "import { variants } from '@typedcss/css'; variants({ ...spread });",
    },
    {
      code: "import { variants } from '@typedcss/css'; variants({ size: 'not-an-object' });",
    },
    {
      code: "import { variants } from '@typedcss/css'; variants({ size: { ...nestedSpread } });",
    },
    {
      code: "import { variants } from '@typedcss/css'; variants({ size: { small: styles.small } });",
    },
    {
      // the default name stops being the styling prop once renamed
      code: '<div sx={{ color: "red" }} />',
      settings: { typedcss: { styleProp: 'classStyle' } },
    },
  ],
  invalid: [
    {
      code: '<div sx={{ color: "red" }} />',
      errors: [{ messageId: 'noInlineObjectInStyleProp' }],
    },
    {
      code: '<div sx={[styles.base, { color: "red" }]} />',
      errors: [{ messageId: 'noInlineObjectInStyleProp' }],
    },
    {
      code: '<div sx={{ [styles.active]: isActive }} />',
      errors: [{ messageId: 'noInlineObjectInStyleProp' }],
    },
    {
      // settings retarget this rule too, without per-rule options
      code: '<div classStyle={{ color: "red" }} />',
      settings: { typedcss: { styleProp: 'classStyle' } },
      errors: [{ messageId: 'noInlineObjectInStyleProp' }],
    },
    {
      // a per-rule option wins over the shared setting
      code: '<div classStyle={[styles.base, { color: "red" }]} />',
      settings: { typedcss: { styleProp: 'sx' } },
      options: [{ styleProp: 'classStyle' }],
      errors: [{ messageId: 'noInlineObjectInStyleProp' }],
    },
    {
      code: "import { props } from '@typedcss/css'; props({ color: 'red' })",
      errors: [{ messageId: 'noInlineObjectInCssUse' }],
    },
    {
      code: "import * as css from '@typedcss/css'; css.props(styles.base, { background: 'blue' })",
      errors: [{ messageId: 'noInlineObjectInCssUse' }],
    },
    {
      code: "import css from '@typedcss/css'; <div className={css.props({ color: 'red' })} />",
      errors: [{ messageId: 'noInlineObjectInCssUse' }],
    },
  ],
});
