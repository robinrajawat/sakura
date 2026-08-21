import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// First slice of Diagrams' larger remainder. Exercises the real, unchanged
// getDiagramDisplayList()/diagramCanReorder() wrapper functions against real global diagram/UI
// filter state, not the extracted core functions directly.
test.describe('generated diagramDisplayList block (src/state/diagramDisplayList.ts spliced into index.html)', () => {
  test('getDiagramDisplayList filters/sorts/pins correctly, and diagramCanReorder reflects real UI state, both through the real wrapper functions', async ({ page }) => {
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
      nodes = [{ id: 1, text: 'Real node', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }];

      // @ts-expect-error
      diagrams = [
        { id: 'd1', title: 'Auth Flow', status: 'final', anchorNodeId: 1, modifiedAt: 100, isWhiteboard: false },
        { id: 'd2', title: 'Payments', status: 'draft', anchorNodeId: null, modifiedAt: 300, isWhiteboard: false },
        { id: 'd3', title: 'Whiteboard', status: 'draft', anchorNodeId: null, modifiedAt: 5, isWhiteboard: true },
      ];

      // Real search filter, through the real wrapper.
      // @ts-expect-error
      diagramSearchQuery = 'auth';
      // @ts-expect-error
      diagramUnlinkedOnly = false;
      // @ts-expect-error
      diagramSortMode = 'manual';
      // @ts-expect-error
      const searchResult = getDiagramDisplayList().map((d) => d.id);

      // Real sort-by-modified, no search, through the real wrapper — whiteboard still pins
      // first despite being oldest.
      // @ts-expect-error
      diagramSearchQuery = '';
      // @ts-expect-error
      diagramSortMode = 'modified';
      // @ts-expect-error
      const sortedResult = getDiagramDisplayList().map((d) => d.id);

      // Real diagramCanReorder() under different real UI states.
      // @ts-expect-error
      diagramSortMode = 'manual';
      // @ts-expect-error
      diagramSelectMode = true;
      // @ts-expect-error
      const canReorderTrue = diagramCanReorder();
      // @ts-expect-error
      diagramSelectMode = false;
      // @ts-expect-error
      const canReorderFalseNoSelect = diagramCanReorder();

      return { searchResult, sortedResult, canReorderTrue, canReorderFalseNoSelect };
    });

    expect(result.searchResult).toEqual(['d1']);
    // Sorted by modifiedAt desc (d2:300, d1:100, d3:5) but whiteboard d3 pinned to front.
    expect(result.sortedResult).toEqual(['d3', 'd2', 'd1']);
    expect(result.canReorderTrue).toBe(true);
    expect(result.canReorderFalseNoSelect).toBe(false);

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
