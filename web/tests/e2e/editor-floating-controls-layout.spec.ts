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
// closing up. They share one flex row (#editor-floating-controls). The Pad toggle that used to sit
// there went with the Pad panel, and the "show toolbar" toggle went when the toolbar became
// always-on (item 14) -- so maximize is the only button left, flush with the row's right edge.
test.describe('Floating editor-corner toggles sit adjacent with no gap', () => {
  test('maximize is the only floating toggle left, with no hole where removed ones used to be', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    await expect(page.locator('#editor-pad-toggle')).toHaveCount(0);
    await expect(page.locator('#editor-toolbar-toggle')).toHaveCount(0);
    await expect(page.locator('#editor-zen-toggle')).toBeVisible();
    await expect(page.locator('#editor-floating-controls > *')).toHaveCount(1);

    const gap = await page.evaluate(() => {
      const row = document.getElementById('editor-floating-controls')!.getBoundingClientRect();
      const zen = document.getElementById('editor-zen-toggle')!.getBoundingClientRect();
      return row.right - zen.right;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(2);
  });
});
