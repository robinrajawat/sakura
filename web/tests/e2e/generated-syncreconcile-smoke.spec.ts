import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Sync subsystem — Phase 4, second slice. Exercises the real, unchanged findIdsMissingFromCloud
// function against a real DOM page (no Firestore/auth required, since the function itself is
// pure) — proving it splices in correctly and is callable exactly as pullAndMergeFromCloud's own
// two real call sites (the docs loop and the templates loop) use it.
test.describe('generated syncReconcile block (src/state/syncReconcile.ts spliced into index.html)', () => {
  test('findIdsMissingFromCloud returns local ids missing from the cloud set, through the real function', async ({ page }) => {
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
      const someMissing = findIdsMissingFromCloud(['a', 'b', 'c'], new Set(['b']));
      // @ts-expect-error
      const noneMissing = findIdsMissingFromCloud(['a', 'b'], new Set(['a', 'b']));
      // @ts-expect-error
      const allMissing = findIdsMissingFromCloud(['x', 'y'], new Set());
      return { someMissing, noneMissing, allMissing };
    });

    expect(result.someMissing).toEqual(['a', 'c']);
    expect(result.noneMissing).toEqual([]);
    expect(result.allMissing).toEqual(['x', 'y']);

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
