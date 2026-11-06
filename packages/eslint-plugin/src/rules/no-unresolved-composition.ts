/**
 * @fileoverview Warn when class names are composed outside css.props()
 */

import type { Rule } from 'eslint';
import type { Node } from 'estree';
import { callsCore, memberName, variableOf } from '../util/coreImport';

export const noUnresolvedComposition: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Warn when class names are composed outside css.props()',
    },
    schema: [],
    messages: {
      merge:
        'Separate css.props() results cannot resolve conflicts with each other. Merge them into one css.props(a, b) call, passing conditional styles as css.props(a, active && b).',
      wrapped:
        'css.props() results cannot be passed to functions, including css.props() itself. Pass the styles directly to one css.props() call, e.g. css.props(a, active && b, [c, d]).',
      stringified:
        'css.props() returns { className, style }, not a class string. Spread it onto the element, or read .className.',
      external:
        'css.props() cannot order external class names ({{values}}); their precedence is left to the CSS cascade. Rewrite them as styles with css.create() and pass them into the same css.props() call.',
    },
  },
  create(context) {
    const reported = new Set<Node>();

    function resolve(node: Node, seen: Set<Node>): Node[] {
      if (seen.has(node)) return [];
      seen.add(node);
      if (node.type === 'Identifier') {
        const variable = variableOf(context, node);
        if (!variable || variable.defs.some((def) => def.type !== 'Variable'))
          return [];
        const start = node.range?.[0] ?? 0;
        return variable.references.flatMap((reference) =>
          reference.writeExpr && (reference.writeExpr.range?.[1] ?? 0) <= start
            ? [reference.writeExpr, ...resolve(reference.writeExpr, seen)]
            : [],
        );
      }
      if (node.type === 'MemberExpression' && !isUse(node)) {
        const name = memberName(node);
        if (name === null) return [];
        return resolve(node.object, seen).flatMap((object) => {
          if (object.type !== 'ObjectExpression') return [];
          return object.properties.flatMap((property) =>
            property.type === 'Property' &&
            !property.computed &&
            (property.key.type === 'Identifier'
              ? property.key.name
              : property.key.type === 'Literal'
                ? property.key.value
                : null) === name
              ? [property.value, ...resolve(property.value, seen)]
              : [],
          );
        });
      }
      return [];
    }

    function stored(node: Node, seen: Set<Node>): boolean {
      return resolve(node, new Set(seen)).some(
        (value) =>
          value !== node && uses(value, new Set([...seen, node])).length > 0,
      );
    }

    const isUse = (node: Node) => callsCore(context, node, 'props');

    function parts(node: Node): Node[] | null {
      if (node.type === 'BinaryExpression' && node.operator === '+') {
        return [node.left, node.right];
      }
      if (node.type === 'TemplateLiteral') {
        return [...node.expressions, ...node.quasis];
      }
      if (node.type === 'AssignmentExpression' && node.operator === '+=') {
        return [node.left, node.right];
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        memberName(node.callee) === 'join'
      ) {
        const object = node.callee.object;
        const arrays = [object, ...resolve(object, new Set())].filter(
          (value) => value.type === 'ArrayExpression',
        );
        if (arrays.length === 0) return null;
        return arrays.flatMap((array) =>
          array.elements.filter(
            (item): item is NonNullable<typeof item> => item !== null,
          ),
        );
      }
      return null;
    }

    function meaningful(node: Node): boolean {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value.trim().length > 0;
      }
      if (node.type === 'TemplateElement') {
        return (node.value.cooked ?? node.value.raw).trim().length > 0;
      }
      return true;
    }

    function isProps(node: Node): boolean {
      if (isUse(node)) return true;
      if (node.type !== 'Identifier' && node.type !== 'MemberExpression')
        return false;
      return resolve(node, new Set()).some(isUse);
    }

    function isResult(node: Node): boolean {
      return (
        node.type === 'MemberExpression' &&
        memberName(node) === 'className' &&
        isProps(node.object)
      );
    }

    function uses(node: Node, seen = new Set<Node>()): Node[] {
      if (isResult(node)) return [node];
      if (
        (node.type === 'Identifier' || node.type === 'MemberExpression') &&
        stored(node, seen)
      )
        return [node];
      const children = parts(node);
      if (children) return children.flatMap((child) => uses(child, seen));
      if (node.type === 'ConditionalExpression') {
        return [...uses(node.consequent, seen), ...uses(node.alternate, seen)];
      }
      if (node.type === 'LogicalExpression') {
        return [...uses(node.left, seen), ...uses(node.right, seen)];
      }
      return [];
    }

    function passed(node: Node): Node[] {
      if (node.type === 'SpreadElement') return passed(node.argument);
      if (isProps(node)) return [node];
      const arrays = [node, ...resolve(node, new Set())].filter(
        (value) => value.type === 'ArrayExpression',
      );
      if (arrays.length > 0) {
        return arrays.flatMap((array) =>
          array.elements.flatMap((element) =>
            element && passed(element).length > 0 ? [node] : [],
          ),
        );
      }
      return uses(node);
    }

    function check(node: Node) {
      if (node.type === 'CallExpression') {
        const calls = node.arguments.flatMap(passed);
        if (calls.some((call) => !reported.has(call))) {
          calls.forEach((call) => reported.add(call));
          context.report({ node, messageId: 'wrapped' });
          return;
        }
      }
      const children = parts(node);
      if (!children) return;
      const flatten = (child: Node): Node[] =>
        parts(child)?.flatMap(flatten) ?? [child];
      const objects = children.flatMap(flatten).filter(isProps);
      if (objects.length > 0) {
        if (objects.every((object) => reported.has(object))) return;
        objects.forEach((object) => reported.add(object));
        context.report({ node, messageId: 'stringified' });
        return;
      }
      const values = children.flatMap(flatten).filter(meaningful);
      const calls = values.flatMap((value) => uses(value));
      if (values.length < 2 || !calls.some((call) => !reported.has(call)))
        return;
      calls.forEach((call) => reported.add(call));
      if (values.filter((value) => uses(value).length > 0).length > 1) {
        context.report({ node, messageId: 'merge' });
        return;
      }
      const label = (value: Node) => {
        const text =
          value.type === 'TemplateElement'
            ? JSON.stringify((value.value.cooked ?? value.value.raw).trim())
            : context.sourceCode.getText(value);
        return text.length > 40 ? `${text.slice(0, 39)}…` : text;
      };
      context.report({
        node,
        messageId: 'external',
        data: {
          values: values
            .filter((value) => uses(value).length === 0)
            .map(label)
            .join(', '),
        },
      });
    }

    return {
      BinaryExpression: check,
      TemplateLiteral: check,
      CallExpression: check,
      AssignmentExpression: check,
    };
  },
};
