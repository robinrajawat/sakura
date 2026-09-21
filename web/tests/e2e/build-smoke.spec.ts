import { test, expect } from '@playwright/test';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../dist');

// Requires `npm run build` to have been run first (see .github/workflows/ci.yml — the CI
// job runs build before this test). Not run as part of the plain `npm run test:e2e` local
// loop by default for that reason; kept as its own file so it's easy to run deliberately
// (`npx playwright test build-smoke`) after a local build.
// Requires `npm run build` to have been run first (see .github/workflows/ci.yml — the CI
// job runs build before this test). Skips gracefully rather than failing when dist/ doesn't
// exist yet, so a plain `npm run test:e2e` locally (without building first) doesn't report
// a false failure — run `npm run build && npx playwright test build-smoke` to exercise this
// file deliberately.
test.describe('build output smoke test', () => {
  test.skip(!existsSync(distDir), 'dist/ not built yet — run `npm run build` first');

  test('dist/ exists with both entry pages built', () => {
    expect(existsSync(distDir)).toBe(true);
    expect(existsSync(path.join(distDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(distDir, 'hub.html'))).toBe(true);
  });

  test('built index.html is not truncated relative to source', () => {
    const sourceSize = statSync(path.resolve(__dirname, '../../index.html')).size;
    const builtSize = statSync(path.join(distDir, 'index.html')).size;
    // Vite/Rollup may minify inline scripts, shrinking the file — but a catastrophic
    // truncation (the exact RAWTEXT-hijack failure mode scripts/validate_html_structure.py
    // guards against on the source file) would drop it far more than minification ever
    // would. 30% of source size is a generous floor, not a tight bound.
    expect(builtSize).toBeGreaterThan(sourceSize * 0.3);
  });
});
