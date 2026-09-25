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
// a child's bullet lands precisely under where its parent's text begins -- a clean recursive
// alignment. Sakura's per-depth indent step (the `*N+8*editorScale` constant in render()) used
// to be a value chosen by eye (18, then 24, then 28 across earlier rounds of feedback) that never
// actually matched the row's own drag-handle+dot width, so every child's bullet landed a few
// pixels past its parent's text start -- a small but compounding-looking misalignment that grew
// more visible the deeper a document nested. The indent step must equal
// (drag-handle width + margin) + (dot width + margin), i.e. exactly the same offset the row
// itself uses to place its own label past its own padding-left, so this lines up at every depth.
test.describe('Depth indentation recursively aligns a child bullet with its parent\'s text start', () => {
  test('each child\'s bullet/fold-dot sits exactly under its parent\'s label start', async ({ page }) => {
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

    expect(result.depth1.dotLeft).toBeCloseTo(result.depth0.textLeft, 0);
    expect(result.depth2.dotLeft).toBeCloseTo(result.depth1.textLeft, 0);
  });
});
