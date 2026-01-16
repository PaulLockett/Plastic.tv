/** @type {import('jest').Config} */
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.ts',
    '**/tests/integration/**/*.test.js'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }]
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@lib/(.*)$': '<rootDir>/lib/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@background/(.*)$': '<rootDir>/background/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.ts'],
  collectCoverageFrom: [
    'lib/**/*.{ts,js}',
    'utils/**/*.{ts,js}',
    'background/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,
  // Mock chrome APIs globally
  globals: {
    'chrome': {}
  }
};
