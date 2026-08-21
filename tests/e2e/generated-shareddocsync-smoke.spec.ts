import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Sync subsystem — Phase 4, third slice. Exercises the real, unchanged
// shouldApplySharedDocRealtimeUpdate function — the same decision startSharedDocRealtimeSyncIfNeeded's
// onSnapshot callback delegates to — against real global state (no Firestore/auth required, since
// the function itself is pure), proving it splices in correctly and matches the original's own
// first-snapshot/existence/echo/open-tab check ordering.
test.describe('generated sharedDocSync block (src/state/sharedDocSync.ts spliced into index.html)', () => {
  test('shouldApplySharedDocRealtimeUpdate applies a genuine live update and rejects first-snapshot/missing/echo/tab-switch cases, through the real function', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const el = document.getElementById('sakura-landing-overlay');
        if (el) el.style.display = 'none';
      });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    const result = await page.evaluate(() => {
      // @ts-expect-error — bare global from index.html
      const genuineUpdateApplies = shouldApplySharedDocRealtimeUpdate(false, true, 200, undefined, 'doc1', 'doc1');
      // @ts-expect-error
      const firstSnapshotRejected = !shouldApplySharedDocRealtimeUpdate(true, true, 200, undefined, 'doc1', 'doc1');
      // @ts-expect-error
      const missingSnapshotRejected = !shouldApplySharedDocRealtimeUpdate(false, false, 200, undefined, 'doc1', 'doc1');
      // @ts-expect-error
      const echoRejected = !shouldApplySharedDocRealtimeUpdate(false, true, 200, 200, 'doc1', 'doc1');
      // @ts-expect-error
      const tabSwitchRejected = !shouldApplySharedDocRealtimeUpdate(false, true, 200, undefined, 'doc1', 'doc2');
      return { genuineUpdateApplies, firstSnapshotRejected, missingSnapshotRejected, echoRejected, tabSwitchRejected };
    });

    expect(result.genuineUpdateApplies).toBe(true);
    expect(result.firstSnapshotRejected).toBe(true);
    expect(result.missingSnapshotRejected).toBe(true);
    expect(result.echoRejected).toBe(true);
    expect(result.tabSwitchRejected).toBe(true);

    // Proof the rest of the script still runs — an unrelated, physically-distant function is
    // still callable, the standard check for every cutover.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
