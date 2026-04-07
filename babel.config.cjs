/**
 * Babel configuration for Jest.
 * Transpiles ES Modules → CommonJS so Jest can import them.
 * Only active when NODE_ENV=test (Jest sets this automatically).
 */
module.exports = {
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: { node: 'current' },
            modules: 'commonjs'
          }
        ]
      ]
    }
  }
};
