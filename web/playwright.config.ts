import { defineConfig, devices, webkit } from '@playwright/test';
import fs from 'fs';

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
  // docs/mobile-plan.md: the existing suite runs at desktop size, as before. `*.phone.spec.ts` runs
  // on two phone profiles: `phone-ios` in WebKit, Safari's own engine, and `phone-android` in
  // Chromium (docs/standard-practice-plan.md step 1; owner 2026-11-19: a startup failure on iPhone
  // Safari passed every Chromium test). `*.safari.spec.ts` runs in WebKit only. Gestures go through
  // tests/e2e/fixtures/touch.ts, which works in both engines.
  projects: [
    { name: 'desktop', testIgnore: /\.(phone|safari)\.spec\.ts$/ },
    ...webkitProjects([
      { name: 'safari-iphone', testMatch: /\.safari\.spec\.ts$/, use: { ...devices['iPhone 13'] } },
      { name: 'phone-ios', testMatch: /\.phone\.spec\.ts$/, use: { ...devices['iPhone 13'] } }
    ]),
    { name: 'phone-android', testMatch: /\.phone\.spec\.ts$/, use: { ...devices['Pixel 7'] } }
  ]
});

// CI installs WebKit and always runs these. The cloud container can't download WebKit (and must
// never try: `npx playwright install` there deletes the Chromium build), so a local run without
// WebKit leaves them out and says so, rather than failing every one at browser launch.
function webkitProjects<T>(projects: T[]): T[] {
  if (process.env.CI) return projects;
  let found = false;
  try { found = fs.existsSync(webkit.executablePath()); } catch { /* not installed */ }
  if (found) return projects;
  console.warn('[playwright] WebKit is not installed here: skipping safari-iphone and phone-ios (CI runs them).');
  return [];
}
