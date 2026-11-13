import { defineConfig, devices } from '@playwright/test';

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
  },
  // docs/mobile-plan.md: the existing suite runs at desktop size, as before. `*.phone.spec.ts`
  // runs on two phone profiles instead. Both use Chromium, the one browser CI installs; real iOS
  // Safari is checked on a device (plan, phase 3).
  projects: [
    { name: 'desktop', testIgnore: /\.phone\.spec\.ts$/ },
    { name: 'phone-ios', testMatch: /\.phone\.spec\.ts$/, use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'phone-android', testMatch: /\.phone\.spec\.ts$/, use: { ...devices['Pixel 7'] } }
  ]
});
