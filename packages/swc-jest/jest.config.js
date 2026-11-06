const path = require('path');

module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/__tests__'],
  testEnvironment: 'node',
  testRegex: '\\.test\\.tsx?$',
  transform: {
    '^.+\\.(ts|tsx|mjs)$': [
      '<rootDir>/dist/index.js',
      {
        root: path.join(__dirname, '__tests__/fixture'),
        aliases: { '@/': '' },
        swc: { jsc: { transform: { react: { runtime: 'automatic' } } } },
      },
    ],
  },
};
