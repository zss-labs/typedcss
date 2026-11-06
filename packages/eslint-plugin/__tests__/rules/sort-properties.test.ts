import * as fs from 'fs';
import * as path from 'path';
import { RuleTester } from 'eslint';
import { sortProperties } from '../../src/rules/sort-properties';

const DIR = fs.mkdtempSync(path.join(__dirname, 'fixture-'));
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));
fs.writeFileSync(
  path.join(DIR, 'tokens.ts'),
  `import * as css from '@typedcss/css';
export const media = css.createStatic({
  desktop: '@media (min-width: 992px)',
});`,
);
const APP = path.join(DIR, 'app.ts');

const MOVED_COMMENTS: [string, number, string][] = [
  [
    // comments travel with their property; object comments stay put
    `import * as css from '@typedcss/css';
const styles = css.create({
  card: { // layout
    // the frame
    borderWidth: '1px', // thin
    /* tint */ borderColor: 'red',
    color: 'blue' /* text */,
    // dangling
  },
});`,
    2,
    `import * as css from '@typedcss/css';
const styles = css.create({
  card: { // layout
    color: 'blue' /* text */,
    /* tint */ borderColor: 'red',
    // the frame
    borderWidth: '1px', // thin
    // dangling
  },
});`,
  ],
  [
    // a line comment moved before the closing brace breaks the line
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    borderWidth: '1px', // frame
    color: 'blue', borderColor: 'red' },
});`,
    1,
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    color: 'blue',
    borderColor: 'red', borderWidth: '1px' // frame
  },
});`,
  ],
  [
    // no blank line when a line break already follows
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    borderWidth: '1px', // frame
    color: 'blue',
  },
});`,
    1,
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    color: 'blue',
    borderWidth: '1px', // frame
  },
});`,
  ],
  [
    // a line comment moved before a property on the same line breaks the line
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    borderColor: 'red', color: 'blue', // text
    borderWidth: '1px',
  },
});`,
    1,
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: {
    color: 'blue', // text
    borderColor: 'red',
    borderWidth: '1px',
  },
});`,
  ],
  [
    // a line comment moved mid-line in a one-line object
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: { borderWidth: '1px', // frame
    color: 'blue', borderColor: 'red' },
});`,
    1,
    `import * as css from '@typedcss/css';
const styles = css.create({
  box: { color: 'blue',
    borderColor: 'red', borderWidth: '1px' // frame
  },
});`,
  ],
];

const ruleTester = new RuleTester();

it('sorts an unrecognized non-literal AST key defensively', () => {
  const context = {
    filename: '/tmp/file.ts',
    sourceCode: { getScope: () => ({ set: new Map(), upper: null }) },
    report: jest.fn(),
  } as any;
  const listeners = sortProperties.create(context) as any;
  listeners.ImportDeclaration({
    source: { value: '@typedcss/css' },
    specifiers: [{ type: 'ImportNamespaceSpecifier', local: { name: 'css' } }],
  });
  const odd = {
    type: 'Property',
    computed: false,
    key: { type: 'CallExpression' },
    value: { type: 'Literal', value: 1 },
  };
  const computed = {
    type: 'Property',
    computed: true,
    key: {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: 'key' },
      arguments: [],
    },
    value: { type: 'Literal', value: 1 },
  };
  const color = {
    type: 'Property',
    computed: false,
    key: { type: 'Identifier', name: 'color' },
    value: { type: 'Literal', value: 'red' },
  };
  listeners.CallExpression({
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      object: { type: 'Identifier', name: 'css' },
      property: { type: 'Identifier', name: 'create' },
    },
    arguments: [
      {
        type: 'ObjectExpression',
        properties: [
          {
            type: 'Property',
            value: {
              type: 'ObjectExpression',
              properties: [color, odd, computed],
            },
          },
        ],
      },
    ],
  });
  expect(context.report).not.toHaveBeenCalled();
});

ruleTester.run('sort-properties', sortProperties, {
  valid: [
    {
      code: `import * as css from '@typedcss/css'; css.create({ box: { [1 + 1]: 1 } });`,
    },
    {
      code: `import * as css from '@typedcss/css'; css.create({ box: { [getKey()]: 1 } });`,
    },
    {
      // a createStatic key sorts with the at-rules and keeps its written order
      code: `import * as css from '@typedcss/css';
import { media } from './tokens';
const styles = css.create({ grid: { display: 'grid', '@media (min-width: 640px)': { gap: 8 }, [media.desktop]: { gap: 16 } } });`,
      filename: APP,
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { position: "absolute", top: "0", right: "0", bottom: "0", left: "0", display: "block" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { ...x, b: 1, a: 2 } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { z: 1, a: 2 } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ key1: { position: 'absolute', color: 'red'} });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { ":hover": { color: \'blue\'}, "&": { color: \'red\'} } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { display: "block", ":hover": { color: "red" } } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import { create } from '@typedcss/css'; const styles = create({ key1: { position: 'absolute', color: 'red'} });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import { keyframes } from '@typedcss/css'; const anim = keyframes({ key1: { position: 'absolute', color: 'red'} });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import { viewTransitionClass } from '@typedcss/css'; const vt = viewTransitionClass({ key1: { position: 'absolute', color: 'red'} });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import plumeria from '@typedcss/css'; const styles = plumeria.create({ key1: { position: 'absolute', color: 'red'} });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    // Without @typedcss/css import, should NOT trigger
    {
      code: 'const styles = { key1: { display: "block", position: "absolute" } };',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Empty object (LIS check)
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: {} });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Spread at start
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { ...s, position: "absolute" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Non-typedcss import
      code: 'import * as other from "other"; other.create({ main: { color: "red" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // String literal import
      code: 'import { "create" as c } from "@typedcss/css"; c({ main: { color: "red" } });',
      settings: {
        ecmaVersion: 'latest',
      },
    },
    {
      // Non-Identifier object in MemberExpression
      code: 'import * as css from "@typedcss/css"; (function(){ return css; })().create({ main: { color: "red" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Computed member access for create
      code: 'import * as css from "@typedcss/css"; css["create"]({ main: { color: "red" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Non-plumeria function call
      code: 'import { create } from "@typedcss/css"; someOtherFunction();',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Top-level spread in create
      code: 'import { create } from "@typedcss/css"; create({ ...spread, main: { color: "red" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Non-object argument in create
      code: 'import { create } from "@typedcss/css"; create(arg);',
      settings: {
        ecmaVersion: 2021,
      },
    },
    // the fixed output settles in one pass
    ...MOVED_COMMENTS.map(([, , output]) => output),
  ],
  invalid: [
    {
      code: `import * as css from '@typedcss/css';
const styles = css.create({
  card: {
    borderWidth: '1px',
    borderColor: 'red',
  },
});`,
      output: `import * as css from '@typedcss/css';
const styles = css.create({
  card: {
    borderColor: 'red',
    borderWidth: '1px',
  },
});`,
      errors: 1,
    },
    {
      code: `import * as css from '@typedcss/css';
import { media } from './tokens';
const styles = css.create({ grid: { [media.desktop]: { gap: 16 }, display: 'grid', gap: 8 } });`,
      output: `import * as css from '@typedcss/css';
import { media } from './tokens';
const styles = css.create({ grid: { display: 'grid', gap: 8, [media.desktop]: { gap: 16 } } });`,
      filename: APP,
      errors: [
        {
          messageId: 'sortProperties',
          data: { property: '@media (min-width: 992px)', position: 3 },
        },
      ],
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ tip: { top: 0, positionTryFallbacks: 'flip-block', positionArea: 'top', position: 'absolute', anchorName: '--a' } });",
      errors: 3,
      output:
        "import * as css from '@typedcss/css'; const styles = css.create({ tip: { position: 'absolute', positionArea: 'top', positionTryFallbacks: 'flip-block', anchorName: '--a', top: 0 } });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const above = css.positionTry({ marginBottom: 8, top: 0 });",
      errors: 1,
      output:
        "import * as css from '@typedcss/css'; const above = css.positionTry({ top: 0, marginBottom: 8 });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { display: "block", position: "absolute", top: "0", right: "0", bottom: "0", left: "0" } });',
      errors: 1,
      output:
        'import * as css from "@typedcss/css"; const styles = css.create({ key1: { position: "absolute", top: "0", right: "0", bottom: "0", left: "0", display: "block" } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: {\n  left: 0,\n  position: "absolute"\n} });',
      errors: 1,
      output:
        'import * as css from "@typedcss/css"; const styles = css.create({ key1: {\n  position: "absolute",\n  left: 0\n} });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ key1: { '@media (min-width: 1024px)': { color: 'purple' }, '&:hover': { color: 'red' }, '&': { color: 'blue' } } });",
      errors: 1,
      output:
        "import * as css from '@typedcss/css'; const styles = css.create({ key1: { '&:hover': { color: 'red' }, '&': { color: 'blue' }, '@media (min-width: 1024px)': { color: 'purple' } } });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const key = 'z'; const styles = css.create({ key1: { [key]: 'value', display: 'block' } });",
      errors: 1,
      output:
        "import * as css from '@typedcss/css'; const key = 'z'; const styles = css.create({ key1: { display: 'block', [key]: 'value' } });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ key1: { '@container (min-width: 1024px)': { color: 'purple' }, '&:hover': { color: 'red' } } });",
      errors: 1,
      output:
        "import * as css from '@typedcss/css'; const styles = css.create({ key1: { '&:hover': { color: 'red' }, '@container (min-width: 1024px)': { color: 'purple' } } });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: "import * as css from '@typedcss/css'; const styles = css.create({ key1: { [`z-prop`]: 'value', display: 'block' } });",
      errors: 1,
      output:
        "import * as css from '@typedcss/css'; const styles = css.create({ key1: { display: 'block', [`z-prop`]: 'value' } });",
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      code: `import * as css from '@typedcss/css'; const styles = css.create({
          key1: {
            ...spread,
            display: "block",
            position: "absolute"
          }
        });`,
      errors: 1,
      output: `import * as css from '@typedcss/css'; const styles = css.create({
          key1: {
            ...spread,
            position: "absolute",
            display: "block"
          }
        });`,
      settings: {
        ecmaVersion: 2021,
      },
    },
    {
      // Spread at end in invalid
      code: 'import * as css from "@typedcss/css"; const styles = css.create({ key1: { display: "block", position: "absolute", ...s } });',
      errors: 1,
      output:
        'import * as css from "@typedcss/css"; const styles = css.create({ key1: { position: "absolute", display: "block", ...s } });',
      settings: {
        ecmaVersion: 2021,
      },
    },
    ...MOVED_COMMENTS.map(([code, errors, output]) => ({
      code,
      errors,
      output,
    })),
  ],
});
