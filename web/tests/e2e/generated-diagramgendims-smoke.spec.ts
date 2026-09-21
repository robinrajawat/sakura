import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// First slice of the diagramGen* subsystem. Exercises the real, unchanged
// diagramGenHardTruncate/diagramGenLighten/diagramGenAdjustDimsForShape/diagramGenBoxDims/
// diagramGenMergedBoxDims wrapper functions — not the extracted *Core functions directly — to
// prove the real call sites still resolve correctly after the splice.
test.describe('generated diagramGenDims block (src/core/diagramGenDims.ts spliced into index.html)', () => {
  test('diagramGenHardTruncate/diagramGenLighten/diagramGenAdjustDimsForShape/diagramGenBoxDims/diagramGenMergedBoxDims all work through the real wrapper functions', async ({ page }) => {
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
      // @ts-expect-error — bare globals from index.html
      const truncated = diagramGenHardTruncate('a fairly long node label indeed', 15);
      // @ts-expect-error
      const untouched = diagramGenHardTruncate('short', 20);

      // @ts-expect-error
      const lightened = diagramGenLighten('#000000', 0.5);
      // @ts-expect-error
      const bogusHex = diagramGenLighten('not-a-color', 0.5);

      // @ts-expect-error
      const decisionDims = diagramGenAdjustDimsForShape({ w: 200, h: 44 }, 'decision');
      // @ts-expect-error
      const actorDims = diagramGenAdjustDimsForShape({ w: 999, h: 999 }, 'actor');
      // @ts-expect-error
      const boxDims = diagramGenAdjustDimsForShape({ w: 200, h: 44 }, 'box');

      // @ts-expect-error
      const shortBox = diagramGenBoxDims('Short');
      // @ts-expect-error
      const longBox = diagramGenBoxDims('a'.repeat(200));

      // @ts-expect-error
      const mergedBox = diagramGenMergedBoxDims('Short', 'Also short');

      return { truncated, untouched, lightened, bogusHex, decisionDims, actorDims, boxDims, shortBox, longBox, mergedBox };
    });

    expect(result.truncated).toBe('a fairly long \u2026');
    expect(result.untouched).toBe('short');
    expect(result.lightened).toBe('#808080');
    expect(result.bogusHex).toBe('not-a-color');
    expect(result.decisionDims).toEqual({ w: 290, h: 70 });
    expect(result.actorDims).toEqual({ w: 70, h: 86 });
    expect(result.boxDims).toEqual({ w: 200, h: 44 });
    expect(result.shortBox).toEqual({ w: 140, h: 44 });
    expect(result.longBox.w).toBe(260);
    expect(result.mergedBox).toEqual({ w: 140, h: 80 });

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
