// Flat config (ESLint 9+), mirroring legacy/eslint.config.js's own rule choices — see that
// file's comment for why no-use-before-define is the one deliberately-chosen rule here rather
// than routine hygiene.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, classes: true, variables: true, typedefs: true }
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off'
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**']
  }
];
