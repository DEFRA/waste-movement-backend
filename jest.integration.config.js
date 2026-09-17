export default {
  rootDir: '.',
  verbose: true,
  testMatch: ['<rootDir>/test/integration/**/*.test.js'],
  reporters: ['default', ['github-actions', { silent: false }], 'summary'],
  setupFiles: ['<rootDir>/test/integration/helpers/setup-env.js'],
  testTimeout: 30000,
  collectCoverage: false,
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  // Deliberate duplication of jest.config.js's array (plus @defra/cdp-auditing,
  // ESM-only like the rest: unit tests never hit this because they always
  // jest.mock() it, but this suite calls the real audit logger).
  transformIgnorePatterns: [
    `node_modules/(?!${[
      '@defra/hapi-tracing', // Supports ESM only
      'node-fetch', // Supports ESM only
      'uuid',
      '@defra/waste-movement-utils',
      '@defra/cdp-auditing'
    ].join('|')}/)`
  ]
}
