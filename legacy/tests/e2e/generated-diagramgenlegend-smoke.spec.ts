import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// diagramGen* subsystem — fifth slice. Exercises the real, unchanged diagramGenLegendEntries/
// diagramGenLegendCells wrapper functions — the same call path diagramGenFinishGenerate uses —
// against real nodes/nodeMeta, not the extracted *Core functions directly.
test.describe('generated diagramGenLegend block (src/state/diagramGenLegend.ts spliced into index.html)', () => {
  test('legend entries/cells wrapper functions work through real nodes and nodeMeta', async ({ page }) => {
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
      nodes = [
        { id: 1, text: 'UI Layer', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: 'confirmed', slideDivider: false },
        { id: 2, text: 'Approve?', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      const nodeMeta = new Map([
        [1, { shape: 'ui' }],
        [2, { shape: 'decision' }],
      ]);
      // @ts-expect-error
      const entries = diagramGenLegendEntries({ scopeIdxs: [0, 1] }, nodeMeta);
      // @ts-expect-error
      const cellsXml = diagramGenLegendCells(entries, 100, 40);
      return { entries, cellsXml };
    });

    expect(result.entries.map((e: { label: string }) => e.label)).toEqual(['UI / Frontend', 'Decision', 'Confirmed']);
    expect(result.cellsXml).toContain('id="gd-legend-sw0"');
    expect(result.cellsXml).toContain('UI / Frontend');
    expect(result.cellsXml).toContain('x="100"');

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
