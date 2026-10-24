import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // tests/unit/surfaceTokens.test.ts reads src/styles/ as text (?raw); vitest blanks CSS unless included.
    css: { include: [/src\/styles\/.*\.css/] }
  }
});
