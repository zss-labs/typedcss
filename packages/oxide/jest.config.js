module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>/__tests__'],
  testEnvironment: 'node',
  testRegex: '\\.test\\.tsx?$',
  transform: { '^.+\\.(ts|tsx)$': ['@swc/jest'] },
};
