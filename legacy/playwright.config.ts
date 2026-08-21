import { defineConfig } from '@playwright/test';

// Phase 0 (docs/architecture-plan.md): this replaces the write-once-delete-per-session
// pattern used throughout the sharing/template/scrollbar fixes earlier — those tests proved
// the fixes worked at the time, then were deleted, leaving nothing to catch a future
// regression. Tests here are meant to stay in the repo and grow.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    // file:// against the repo-root index.html/hub.html directly — these are still the
    // real, live, hand-maintained production files in Phase 0 (nothing has moved into
    // dist/ as the thing actually being tested yet; see the separate build-smoke test for
    // build-output verification specifically).
  }
});
