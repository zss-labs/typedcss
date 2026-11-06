/**
 * @fileoverview Disallow destructure API
 */

import type { Rule } from 'eslint';
import type { ImportSpecifier } from 'estree';

export const noDestructure: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow destructuring API',
    },
    messages: {
      noDestructure:
        'Do not destructure "{{property}}" from "{{object}}". Use dot notation instead.',
    },
    schema: [],
  },

  create(context) {
    const coreAliases: Record<string, string> = {};

    return {
      ImportDeclaration(node) {
        if (node.source.value === '@typedcss/css') {
          node.specifiers.forEach((specifier) => {
            if (specifier.type === 'ImportNamespaceSpecifier') {
              coreAliases[specifier.local.name] = 'NAMESPACE';
            } else if (specifier.type === 'ImportDefaultSpecifier') {
              coreAliases[specifier.local.name] = 'NAMESPACE';
            } else {
              const spec = specifier as ImportSpecifier;
              const importedName =
                spec.imported.type === 'Identifier'
                  ? spec.imported.name
                  : String(spec.imported.value);
              coreAliases[specifier.local.name] = importedName;
            }
          });
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type === 'ObjectPattern' &&
          node.init &&
          node.init.type === 'Identifier'
        ) {
          const initName = node.init.name;
          const alias = coreAliases[initName];

          if (alias === 'NAMESPACE') {
            for (const prop of node.id.properties) {
              if (prop.type === 'Property' && prop.key.type === 'Identifier') {
                const keyName = prop.key.name;
                if (
                  keyName === 'create' ||
                  keyName === 'createStatic' ||
                  keyName === 'createTheme' ||
                  keyName === 'keyframes' ||
                  keyName === 'viewTransitionClass' ||
                  keyName === 'positionTry' ||
                  keyName === 'varType' ||
                  keyName === 'props'
                ) {
                  context.report({
                    node: prop,
                    messageId: 'noDestructure',
                    data: {
                      property: keyName,
                      object: initName,
                    },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
};
