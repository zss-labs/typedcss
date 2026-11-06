import {
  callsCore,
  importedFromCore,
  memberName,
  variableOf,
} from '../../src/util/coreImport';

const identifier = (name: string) => ({ type: 'Identifier', name }) as any;

it('resolves variables through parent scopes and handles missing bindings', () => {
  const variable = { defs: [] } as any;
  const upper = { set: new Map([['css', variable]]), upper: null } as any;
  const context = {
    sourceCode: { getScope: () => ({ set: new Map(), upper }) },
  } as any;
  expect(variableOf(context, identifier('css'))).toBe(variable);
  expect(variableOf(context, identifier('missing'))).toBeNull();
});

it('recognizes member names and rejects non-import nodes and definitions', () => {
  expect(
    memberName({ computed: false, property: identifier('create') } as any),
  ).toBe('create');
  expect(
    memberName({
      computed: true,
      property: { type: 'Literal', value: 'create' },
    } as any),
  ).toBe('create');
  expect(
    memberName({ computed: true, property: identifier('create') } as any),
  ).toBeNull();

  const context = {
    sourceCode: {
      getScope: () => ({
        set: new Map([
          ['local', { defs: [{ type: 'Variable' }] }],
          [
            'other',
            {
              defs: [
                {
                  type: 'ImportBinding',
                  parent: { source: { value: 'other' } },
                },
              ],
            },
          ],
        ]),
        upper: null,
      }),
    },
  } as any;
  expect(
    importedFromCore(context, { type: 'Literal', value: 1 } as any, 'create'),
  ).toBe(false);
  expect(importedFromCore(context, identifier('missing'), 'create')).toBe(
    false,
  );
  expect(importedFromCore(context, identifier('local'), 'create')).toBe(false);
  expect(importedFromCore(context, identifier('other'), 'create')).toBe(false);
  expect(callsCore(context, identifier('local'), 'create')).toBe(false);
  expect(
    callsCore(
      context,
      {
        type: 'CallExpression',
        callee: { type: 'Literal', value: 1 },
        arguments: [],
      } as any,
      'create',
    ),
  ).toBe(false);
});
