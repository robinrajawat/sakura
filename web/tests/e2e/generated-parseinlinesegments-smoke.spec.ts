import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Image export — first slice. Exercises the real, unchanged parseInlineSegments() wrapper — the
// same call path measureTreeImage uses — and confirms measureTreeImage itself (genuinely
// canvas-bound, deliberately not touched by this slice) still resolves it correctly and produces
// real measurements.
test.describe('generated parseInlineSegments block (src/utils/parseInlineSegments.ts spliced into index.html)', () => {
  test('parseInlineSegments works through the real wrapper, and measureTreeImage still resolves it correctly', async ({ page }) => {
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
      const segments = parseInlineSegments('see [Setup] and `npm test` (carefully)');

      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root with `code` and [Section]', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error — measureTreeImage is genuinely canvas-bound, still calls the real
      // parseInlineSegments wrapper internally
      const measured = measureTreeImage(nodes, false);

      return {
        segmentTypes: segments.map((s: { type: string }) => s.type),
        measuredOk: !!measured && typeof measured.width === 'number' && measured.rows.length === 1
      };
    });

    expect(result.segmentTypes).toEqual(['text', 'section', 'text', 'code', 'text', 'note']);
    expect(result.measuredOk).toBe(true);

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
