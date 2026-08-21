import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Sync subsystem — Phase 4, first slice. Exercises the real, unchanged applyIncomingDocData/
// applyIncomingTemplateData/applyIncomingMetaData functions — the same call paths the periodic
// pullAndMergeFromCloud and realtime onSnapshot listeners use — against real
// localStorage/_lastPushedTs global state, proving all three real callers correctly delegate the
// "should apply" decision to shouldApplyIncomingSyncCore and that the real storage writes still
// happen when it says yes.
test.describe('generated syncApply block (src/state/syncApply.ts spliced into index.html)', () => {
  test('applyIncomingDocData/applyIncomingTemplateData/applyIncomingMetaData correctly apply, reject stale, and reject echoes, through the real functions', async ({ page }) => {
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

    const result = await page.evaluate(async () => {
      // --- Doc: a brand-new document (no local index entry) applies regardless of timestamp ---
      // @ts-expect-error — bare globals from index.html
      const docId = 'test-doc-' + Date.now();
      // @ts-expect-error
      const docApplied = applyIncomingDocData(docId, { updatedAt: 500, title: 'New Doc' }, false);
      // @ts-expect-error
      const docIndexAfter = loadDocsIndex().find((d) => d.id === docId);

      // Regenerate a second, older update — should be rejected as stale now that a local entry
      // with updatedAt=500 exists (touchDocIndex stamps Date.now(), always newer than 500).
      // @ts-expect-error
      const docStaleRejected = !applyIncomingDocData(docId, { updatedAt: 1, title: 'Stale' }, false);

      // Echo suppression: simulate having just pushed this exact timestamp.
      // @ts-expect-error
      _lastPushedTs['doc:' + docId] = 999;
      // @ts-expect-error
      const docEchoRejected = !applyIncomingDocData(docId, { updatedAt: 999, title: 'Echo' }, false);

      // --- Template: same "new item always applies" shape ---
      // @ts-expect-error
      const tplId = 'test-tpl-' + Date.now();
      // @ts-expect-error
      const tplApplied = applyIncomingTemplateData(tplId, { updatedAt: 500, title: 'New Template' });
      // @ts-expect-error
      const tplIndexAfter = loadTemplatesIndex().find((t) => t.id === tplId);
      // @ts-expect-error
      const tplStaleRejected = !applyIncomingTemplateData(tplId, { updatedAt: 1, title: 'Stale' });

      // --- Meta: real localStorage-backed key (prefs), no "new item" bypass ---
      // @ts-expect-error
      const metaApplied = await applyIncomingMetaData('prefs', { updatedAt: 500, value: { theme: 'dark' } });
      // @ts-expect-error
      const metaValue = localStorage.getItem(getSyncMetaKeys().prefs);
      // @ts-expect-error
      const metaStaleRejected = !(await applyIncomingMetaData('prefs', { updatedAt: 1, value: { theme: 'light' } }));

      return {
        docApplied,
        docIndexTitle: docIndexAfter?.title,
        docStaleRejected,
        docEchoRejected,
        tplApplied,
        tplIndexTitle: tplIndexAfter?.title,
        tplStaleRejected,
        metaApplied,
        metaValueParsed: metaValue ? JSON.parse(metaValue) : null,
        metaStaleRejected,
      };
    });

    expect(result.docApplied).toBe(true);
    expect(result.docIndexTitle).toBe('New Doc');
    expect(result.docStaleRejected).toBe(true);
    expect(result.docEchoRejected).toBe(true);

    expect(result.tplApplied).toBe(true);
    expect(result.tplIndexTitle).toBe('New Template');
    expect(result.tplStaleRejected).toBe(true);

    expect(result.metaApplied).toBe(true);
    expect(result.metaValueParsed).toEqual({ theme: 'dark' });
    expect(result.metaStaleRejected).toBe(true);

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
