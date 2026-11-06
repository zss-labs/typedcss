import { RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import { noUnresolvedComposition } from '../../src/rules/no-unresolved-composition';
import plugin from '../../src';

const prefix = "import * as css from '@typedcss/css'; ";
const ruleTester = new RuleTester();

ruleTester.run('no-unresolved-composition', noUnresolvedComposition, {
  valid: [
    ...[
      'css.props(styles.p(c))',
      'css.props(a, active && styles.p(c))',
      'css.props(active ? a : styles.p(c))',
      'const d = styles.p(c); css.props(a, d)',
    ].map(
      (code) =>
        prefix +
        'const styles = css.create({ p: (c) => ({ color: c }) }); ' +
        code,
    ),
    ...[
      'css.props(a, b)',
      'css.props(a).className + " "',
      'css.props(a).style + " b"',
      'active ? css.props(a) : css.props(b)',
      '"a " + "b"',
      'function f(css) { return css.props(a) + " b"; }',
      'css[method](a) + " b"',
      'String(css.props(a).length) + "px"',
      'css.props(a, [b, [active && c]])',
      'createElement("div", { className: css.props(a) })',
      'const x = css.props(a); createElement("div", { className: x })',
      'const x = css.props(a); const y = x;',
      'let x = ""; x += " b"',
      'const styles = css.create({ a: {} }); css.props(styles.a)',
      'const styles = css.create({ a: {} }); css.props(styles.a, active && styles.b)',
      'css.props(other.palette(color))',
      'getCss().props(a) + " b"',
      'css.props(4)',
      'const o = { [key]: css.props(a) }; clsx(o.base)',
      'const o = { base: css.props(a) }; clsx(o[method])',
      'const o = { base: css.props(a) }; clsx(o.other)',
      'const list = [a]; list.slice().join(" ")',
      'let x = x; clsx(x)',
      'const styles = css.create({ p: (c) => ({ color: c }) }); createElement("div", { sx: styles.p(c) })',
    ].map((code) => prefix + code),
    'css.props(a) + " b"',
    'import * as css from "other"; css.props(a) + " b"',
    'import { props } from "@typedcss/css"; function f(props) { return props(a) + " b"; }',
  ],
  invalid: [
    ...[
      'css.props(a) + " "',
      'css.props(a) + " x"',
      '`${css.props(a)} `',
      '[css.props(a)].join(" ")',
      'css.props(a) + " " + css.props(b)',
      'const p = css.props(a); `${p} x`',
      'let x = css.props(a); x += " x"',
      'const o = { base: css.props(a) }; o.base + " x"',
    ].map((code) => ({
      code: prefix + code,
      errors: [{ messageId: 'stringified' }],
      output: null,
    })),
    ...[
      'clsx(css.props(a), className)',
      'twMerge([css.props(a), "external"])',
      'f(...[css.props(a)])',
      'css.props(css.props(a))',
      'css.props(a, [css.props(b)])',
      'clsx(css.props(a).className, className)',
      'cn(active && css.props(a).className)',
      'const x = css.props(a); clsx(x.className, b)',
      'const x = css.props(a).className; clsx(x)',
      'clsx(css.props(a).className + " external")',
      'const x = css.props(a); clsx(x, b)',
      'const x = css.props(a); const y = x; clsx(y)',
      'const o = { base: css.props(a) }; clsx(o.base)',
      'const o = { "base": css.props(a) }; clsx(o.base)',
      'const o = { 1: css.props(a) }; clsx(o[1])',
      'const list = [css.props(a)]; clsx(list)',
      'const x = css.props(a); css.props(x)',
    ].map((code) => ({
      code: prefix + code,
      errors: [{ messageId: 'wrapped' }],
      output: null,
    })),
    ...[
      'css.props(a).className + " " + css.props(b).className',
      '`${css.props(a).className} ${css.props(b).className}`',
      '[css.props(a).className, css.props(b).className].join(" ")',
      'css.props(a).className + " " + (active ? css.props(b).className : "")',
      'css.props(a).className + " " + css.props(b).className + " external"',
      'const x = css.props(a).className; x + " " + css.props(b).className',
      'let x = css.props(a).className; x += " " + css.props(b).className',
    ].map((code) => ({
      code: prefix + code,
      errors: [{ messageId: 'merge' }],
      output: null,
    })),
    ...[
      '"external " + css.props(a).className',
      '(active ? css.props(a).className : "") + " external"',
      '[active && css.props(a).className, "external"].join(" ")',
      'css["props"](a).className + " external"',
      '[css.props(a).className, "external"]["join"](" ")',
      '`${css.props(a).className + " external"} other`',
      'const p = css.props(a); p.className + " external"',
      'const o = { base: css.props(a) }; o.base.className + " external"',
    ].map((code) => ({
      code: prefix + code,
      errors: [{ messageId: 'external' }],
      output: null,
    })),
    ...[
      ['css.props(a).className + "a b c"', '"a b c"'],
      ['`${css.props(a).className} external`', '"external"'],
      ['css.props(a).className + " " + props.className', 'props.className'],
      ['[css.props(a).className, "x", y].join(" ")', '"x", y'],
      ['const x = css.props(a).className; `${x} external`', '"external"'],
      ['const list = [css.props(a).className, "x"]; list.join(" ")', '"x"'],
      ['let x = css.props(a).className; x += " external"', '" external"'],
      ['const o = { base: css.props(a).className }; o.base + " " + y', 'y'],
      [`css.props(a).className + " ${'b'.repeat(50)}"`, `" ${'b'.repeat(37)}…`],
    ].map(([code, values]) => ({
      code: prefix + code,
      errors: [{ messageId: 'external', data: { values } }],
      output: null,
    })),
    ...[
      'import css from "@typedcss/css"; css.props(a).className + " b"',
      'import { props as apply } from "@typedcss/css"; apply(a).className + " b"',
      'import { "props" as apply } from "@typedcss/css"; apply(a).className + " b"',
      'import * as styles from "@typedcss/css"; styles.props(a).className + " b"',
    ].map((code) => ({
      code,
      errors: [{ messageId: 'external' }],
      output: null,
    })),
  ],
});

test('enabled as a warning in recommended', () => {
  expect(plugin.rules['no-unresolved-composition']).toBe(
    noUnresolvedComposition,
  );
  expect(
    plugin.configs.recommended.rules?.['@typedcss/no-unresolved-composition'],
  ).toBe('warn');
});

const directListener = (variables: Map<string, unknown>) => {
  const reports: Rule.ReportDescriptor[] = [];
  const context = {
    options: [],
    settings: {},
    sourceCode: {
      getScope: () => ({ set: variables, upper: null }),
      getText: () => '',
    },
    report: (descriptor: Rule.ReportDescriptor) => reports.push(descriptor),
  } as unknown as Rule.RuleContext;
  return { listener: noUnresolvedComposition.create(context), reports };
};

const coreImport = {
  defs: [
    {
      type: 'ImportBinding',
      parent: { source: { value: '@typedcss/css' } },
      node: { type: 'ImportNamespaceSpecifier' },
    },
  ],
};

test('stops resolving a cyclic variable without ranges', () => {
  const x = { type: 'Identifier', name: 'x' };
  const variables = new Map<string, unknown>([
    ['css', coreImport],
    ['x', { defs: [{ type: 'Variable' }], references: [{ writeExpr: x }] }],
  ]);
  const { listener, reports } = directListener(variables);
  listener.CallExpression?.({
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: { type: 'Identifier', name: 'css' },
      property: { type: 'Identifier', name: 'props' },
    },
    arguments: [x],
  } as never);
  expect(reports).toHaveLength(0);
});

test('ignores an object property with an unsupported key', () => {
  const object = {
    type: 'ObjectExpression',
    properties: [
      {
        type: 'Property',
        computed: false,
        key: { type: 'Unsupported' },
        value: { type: 'Identifier', name: 'value' },
      },
    ],
    range: [0, 10],
  };
  const variables = new Map<string, unknown>([
    [
      'o',
      { defs: [{ type: 'Variable' }], references: [{ writeExpr: object }] },
    ],
  ]);
  const { listener, reports } = directListener(variables);
  listener.CallExpression?.({
    type: 'CallExpression',
    callee: { type: 'Identifier', name: 'clsx' },
    arguments: [
      {
        type: 'MemberExpression',
        computed: false,
        object: { type: 'Identifier', name: 'o', range: [20, 21] },
        property: { type: 'Identifier', name: 'base' },
      },
    ],
  } as never);
  expect(reports).toHaveLength(0);
});

test('uses raw text when a template element has no cooked value', () => {
  const { listener, reports } = directListener(new Map([['css', coreImport]]));
  listener.TemplateLiteral?.({
    type: 'TemplateLiteral',
    expressions: [
      {
        type: 'MemberExpression',
        computed: false,
        object: {
          type: 'CallExpression',
          callee: {
            type: 'MemberExpression',
            computed: false,
            object: { type: 'Identifier', name: 'css' },
            property: { type: 'Identifier', name: 'props' },
          },
          arguments: [],
        },
        property: { type: 'Identifier', name: 'className' },
      },
    ],
    quasis: [
      { type: 'TemplateElement', value: { cooked: null, raw: 'external' } },
      { type: 'TemplateElement', value: { cooked: '', raw: '' } },
    ],
  } as never);
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    messageId: 'external',
    data: { values: '"external"' },
  });
});
