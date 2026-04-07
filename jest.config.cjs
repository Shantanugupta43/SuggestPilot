/** @type {import('jest').Config} */
module.exports = {
  // Use jsdom to simulate a browser environment (needed for chrome extension APIs)
  testEnvironment: 'jest-environment-jsdom',

  // Transform ESM source files via babel-jest so Jest (CommonJS) can load them
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // Resolve .js extensions
  moduleFileExtensions: ['js', 'json'],

  // Test file discovery
  testMatch: ['**/tests/**/*.test.js'],

  // Global setup — installs the chrome API mock before every test file
  setupFiles: ['./tests/setup/chrome-mock.js'],

  // Runs after the test framework is initialised (jest globals available)
  setupFilesAfterEnv: ['./tests/setup/jest-setup.js'],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/background/service-worker.js',  // purely event-driven, integration-tested separately
    '!src/content/content-script.js'       // DOM injection, integration-tested separately
  ],

  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',

  // Show individual test results in verbose mode
  verbose: true,

  // Fail fast in CI
  bail: false,

  // Map module paths so tests can import with the same paths as src
  moduleNameMapper: {
    '^../config/config-manager\\.js$': '<rootDir>/src/config/config-manager.js',
    '^../utils/rate-limiter\\.js$': '<rootDir>/src/utils/rate-limiter.js'
  }
};
