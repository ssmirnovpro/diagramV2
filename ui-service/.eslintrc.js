module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
    jest: true,
    serviceworker: true,
    worker: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  globals: {
    // Additional service worker globals
    clients: 'readonly',
    skipWaiting: 'readonly',
    registration: 'readonly'
  },
  rules: {
    // Allow console statements in development
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    // Require single quotes
    'quotes': ['error', 'single', { avoidEscape: true }],
    // Allow unused parameters that start with underscore
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Require semicolons
    'semi': ['error', 'always'],
    // Disallow trailing commas in objects/arrays
    'comma-dangle': ['error', 'never'],
    // Require curly braces for all control statements
    'curly': ['error', 'all'],
    // Consistent indentation
    'indent': ['error', 2],
    // Enforce consistent line endings
    'eol-last': ['error', 'always']
  }
};
