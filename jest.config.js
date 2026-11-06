module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '\\.test-d\\.ts$'],
  transform: {
    '^.+\\.(ts|mjs)$': '@swc/jest',
  },
  transformIgnorePatterns: ['node_modules/\\.pnpm/(?!unplugin@)'],
  moduleNameMapper: {
    '^(\\..+)\\.js$': '$1',
  },
  roots: [
    '<rootDir>/packages/css/__tests__',
    '<rootDir>/scripts/__tests__',
    '<rootDir>/packages/codemod/__tests__',
    '<rootDir>/packages/eslint-plugin/__tests__',
    '<rootDir>/packages/init/__tests__',
    '<rootDir>/packages/next-plugin/__tests__',
    '<rootDir>/packages/unplugin/__tests__',
  ],
  testEnvironment: 'node',
  coverageReporters: ['text', 'lcov', 'html'],
  reporters: [
    [process.env.CI ? 'github-actions' : 'default', { silent: false }],
    'summary',
  ],
  coveragePathIgnorePatterns: [
    '<rootDir>/scripts/',
    '<rootDir>/packages/oxide/',
    '<rootDir>/packages/codemod/dist/',
    '<rootDir>/packages/eslint-plugin/dist/',
    '<rootDir>/packages/init/dist/',
    '<rootDir>/packages/next-plugin/dist/',
  ],
};
