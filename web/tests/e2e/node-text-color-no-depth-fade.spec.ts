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

// render() used to mix a node's text color toward --muted the deeper it was nested (a
// color-mix formula applied unconditionally, independent of the since-removed "Fade nested
// text" setting) -- Dynalist never does this, so nested Sakura text looked visibly "faded"
// next to an equivalent Dynalist doc even though both apps render every row in full black.
// Text color must now be flat across all depths, both in view mode (.node-label) and while
// actively editing a node (its contenteditable .node-input).
test.describe('Node text color does not fade with depth', () => {
  test('view-mode .node-label is the same color at every depth', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const colors = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Depth 0', styles: {} },
        { id: 2, depth: 1, text: 'Depth 1', styles: {} },
        { id: 3, depth: 2, text: 'Depth 2', styles: {} },
        { id: 4, depth: 3, text: 'Depth 3', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; editingId = null;
      // @ts-expect-error
      render();
      return [1, 2, 3, 4].map((id) => {
        const label = document.querySelector(`.node-row[data-id="${id}"] .node-label`)!;
        return getComputedStyle(label).color;
      });
    });

    expect(new Set(colors).size).toBe(1);
  });

  test('the actively-edited node keeps the same color regardless of its depth', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
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
      editingId = 3; inputCaret = -1;
      // @ts-expect-error
      render();
      const input = document.getElementById('in-3')!;
      return getComputedStyle(input).color;
    });

    // rgb(34, 34, 34) === #222222, the flat --node-fg value applyNodeFontColor sets for the
    // light theme (matching Dynalist's own measured text color) -- not a color-mix()'d,
    // depth-dependent value.
    expect(result).toBe('rgb(34, 34, 34)');
  });
});
