import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display='none'; });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

async function seedOneNode(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    currentDocId = 'test-doc';
    // @ts-expect-error
    render();
  });
}

// The floating editor-corner toggles used to each be individually position:absolute at a
// hardcoded `right` offset, so hiding one left a dead gap instead of the remaining buttons
// closing up. They now share one flex row (#editor-floating-controls) that collapses
// automatically around whichever buttons are actually visible. The Pad toggle that used to sit
// between maximize and toolbar was removed along with the Pad panel itself -- this also guards
// that its removal didn't leave a hole in the row.
test.describe('Floating editor-corner toggles sit adjacent with no gap', () => {
  test('maximize and toolbar toggles are immediate neighbors now that the Pad toggle is gone', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    await expect(page.locator('#editor-pad-toggle')).toHaveCount(0);
    await expect(page.locator('#editor-zen-toggle')).toBeVisible();
    await expect(page.locator('#editor-toolbar-toggle')).toBeVisible();

    // The gap between them should match the row's own 8px gap, not the ~44px a missing/hidden
    // button used to leave behind.
    const gap = await page.evaluate(() => {
      const zen = document.getElementById('editor-zen-toggle')!.getBoundingClientRect();
      const toolbar = document.getElementById('editor-toolbar-toggle')!.getBoundingClientRect();
      return zen.left - toolbar.right; // toolbar sits to the left of zen (row-reverse)
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(12);
  });
});
