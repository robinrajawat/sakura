import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
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
}

// Dynalist's outline indents each depth level by exactly one row's own bullet-to-text width, so
// a child's bullet lands precisely under where its parent's text begins. An earlier round matched
// that exactly (indent step = drag-handle width + dot width, both in px), but a later explicit
// request asked for one step further still: the child should begin under the parent's SECOND
// character, not its first, so every level reads as "one character deeper" than pure text-start
// alignment. The indent step is now (drag-handle + dot width) + one representative character's
// width at the current content font/size (~9px for Inter 500 14.5px) -- concretely, a child's
// bullet sits ~9px past its parent's own text start, at every depth, consistently. That 9px is
// tied to the current font choice; revisit this constant if font-family/size changes again.
test.describe('Depth indentation aligns a child bullet one character past its parent\'s text start', () => {
  test('each child\'s bullet/fold-dot sits ~9px past its parent\'s label start, at every depth', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Depth 0', styles: {} },
        { id: 2, depth: 1, text: 'Depth 1', styles: {} },
        { id: 3, depth: 2, text: 'Depth 2', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();

      const info = (id: number) => {
        const row = document.querySelector(`.node-row[data-id="${id}"]`)!;
        const rowRect = row.getBoundingClientRect();
        const dot = row.querySelector('.node-dot, .fold-dot')!;
        const label = row.querySelector('.node-label')!;
        return {
          dotLeft: dot.getBoundingClientRect().left - rowRect.left,
          textLeft: label.getBoundingClientRect().left - rowRect.left,
        };
      };
      return { depth0: info(1), depth1: info(2), depth2: info(3) };
    });

    const depth1Offset = result.depth1.dotLeft - result.depth0.textLeft;
    const depth2Offset = result.depth2.dotLeft - result.depth1.textLeft;
    expect(depth1Offset).toBeCloseTo(9, 0);
    expect(depth2Offset).toBeCloseTo(9, 0);
    // The offset must be consistent across depths, not just individually close to 9.
    expect(depth1Offset).toBeCloseTo(depth2Offset, 0);
  });
});
