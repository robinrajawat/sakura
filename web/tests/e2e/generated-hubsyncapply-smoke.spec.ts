import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// Sync subsystem — Phase 4, second real call site of syncApply.ts, this time targeting
// hub.html: pullMetaFromCloud's own inline `cloudTs>localTs` check reused
// shouldApplyIncomingSyncCore directly, verified to degrade to the exact same always-compare
// behavior with no echo-suppression (a one-shot poll, not a live listener). Same low-risk
// cross-file reuse pattern hubGenerateId established — no new source, already covered by
// tests/unit/syncApply.test.ts and index.html's own generated-syncapply-smoke.spec.ts.
test.describe('generated hubSyncApply block (src/state/syncApply.ts spliced into hub.html)', () => {
  test('shouldApplyIncomingSyncCore is a real ambient global in hub.html\'s own script scope, and pullMetaFromCloud stays correctly guarded', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + hubPath);
    await page.waitForTimeout(300);

    const result = await page.evaluate(async () => {
      // @ts-expect-error — bare global from hub.html, the real spliced function
      const fnType = typeof shouldApplyIncomingSyncCore;
      // Same real logic pullMetaFromCloud now delegates to — no echo-suppression (undefined),
      // matching a one-shot poll rather than a live listener.
      // @ts-expect-error
      const appliesWhenNewer = shouldApplyIncomingSyncCore(200, 100, undefined);
      // @ts-expect-error
      const rejectsWhenNotNewer = shouldApplyIncomingSyncCore(100, 100, undefined);

      // pullMetaFromCloud itself: currentUser is unset in a fresh load, so its own early guard
      // (unaffected by this wiring change) short-circuits before ever reaching the
      // shouldApplyIncomingSyncCore call — proving the function is still real, callable, and
      // correctly shaped after the edit.
      // @ts-expect-error
      const pullResult = await pullMetaFromCloud('todos');

      return { fnType, appliesWhenNewer, rejectsWhenNotNewer, pullResult };
    });

    expect(result.fnType).toBe('function');
    expect(result.appliesWhenNewer).toBe(true);
    expect(result.rejectsWhenNotNewer).toBe(false);
    expect(result.pullResult).toBeUndefined();

    // Proof the rest of hub.html's script still runs — an unrelated, physically-distant
    // function is still callable, the standard check for every cutover.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof newTodo === 'function' && typeof bumpSyncTimestamp === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
