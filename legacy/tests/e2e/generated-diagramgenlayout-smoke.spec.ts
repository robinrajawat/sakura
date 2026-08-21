import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Fifth slice of the diagramGen* subsystem — the pure tree-layout engine. Exercises the real,
// unchanged layoutDiagramGenTree wrapper function — not the extracted *Core function directly —
// against a real `nodes` array, to prove the real call site still resolves correctly after the
// splice.
test.describe('generated diagramGenLayout block (src/state/diagramGenLayout.ts spliced into index.html)', () => {
  test('layoutDiagramGenTree works through the real wrapper function', async ({ page }) => {
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
      // Tree: root(0) -> a(1), b(2) — a genuine fan-out, both real leaves.
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];

      const dimsByIdx = new Map([
        [0, { w: 60, h: 44 }],
        [1, { w: 100, h: 44 }],
        [2, { w: 100, h: 44 }]
      ]);

      // @ts-expect-error
      const positions = layoutDiagramGenTree({ rootIdxs: [0] }, dimsByIdx, undefined);

      return {
        size: positions.size,
        root: positions.get(0),
        a: positions.get(1),
        b: positions.get(2)
      };
    });

    expect(result.size).toBe(3);
    // Row width = 100+30+100 = 230; root centered: x = 230/2 - 60/2 = 85.
    expect(result.root).toEqual({ x: 85, y: 0 });
    expect(result.a).toEqual({ x: 0, y: 44 + 50 });
    expect(result.b).toEqual({ x: 130, y: 44 + 50 });

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
