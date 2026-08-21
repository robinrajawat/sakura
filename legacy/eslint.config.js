// Flat config (ESLint 9+). Scoped to src/ and tests/ only — the legacy index.html/hub.html
// inline scripts aren't linted yet (Phase 0 doesn't touch their content at all; linting
// inline <script> blocks needs a dedicated plugin and is a Phase 1+ decision, once code
// starts actually being extracted into real files).
//
// no-use-before-define is turned on deliberately, not as a routine style rule: it is the
// exact rule that would have caught BOTH temporal-dead-zone crashes from this session
// before either one ever ran in a browser — see docs/architecture-plan.md for the specifics
// (the pre-existing FOLDERS_KEY bug, and the one introduced and caught manually while
// building the shared-doc live-sync fix). This is the single highest-value rule in this
// config; everything else here is normal hygiene.
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
      'no-use-before-define': 'off', // superseded by the TS-aware version below
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, classes: true, variables: true, typedefs: true }
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off' // TypeScript's own checker already covers this, and it false-positives on globals
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'index.html', 'hub.html', 'playwright-report/**', 'test-results/**']
  }
];
