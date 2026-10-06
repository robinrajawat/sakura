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

// The inline remark/Q&A previews' small "open in panel" icon only makes sense when there's a
// Pad panel to jump into. With Pad off (Settings -> Features), it used to still render -- a dead
// button pointing at a feature that isn't there.
test.describe('Inline remark/Q&A "open in panel" icon respects the Pad feature toggle', () => {
  test('is hidden on both when Pad is off', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      remarks = [{ id: 'r1', anchorNodeId: 1, person: 'Alex', date: new Date().toISOString().slice(0,10), text: 'A remark' }];
      // @ts-expect-error
      qaItems = [{ id: 'q1', sourceNodeId: 1, question: 'A question?', answer: '', createdAt: Date.now() }];
      // @ts-expect-error
      padRemarksTabEnabled = true; padQaTabEnabled = true;
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([1]); inlineExpandQaNodeIds = new Set([1]);
      // @ts-expect-error
      setPadEnabled(false, false);
      // @ts-expect-error
      render();
    });

    await expect(page.locator('.node-remark-line')).toBeVisible();
    await expect(page.locator('.node-qa-line')).toBeVisible();
    await expect(page.locator('.node-remark-line .node-inline-open-panel-btn')).toHaveCount(0);
    await expect(page.locator('.node-qa-line .node-inline-open-panel-btn')).toHaveCount(0);
  });

  test('still shows on both when Pad is on (regression guard)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      remarks = [{ id: 'r1', anchorNodeId: 1, person: 'Alex', date: new Date().toISOString().slice(0,10), text: 'A remark' }];
      // @ts-expect-error
      qaItems = [{ id: 'q1', sourceNodeId: 1, question: 'A question?', answer: '', createdAt: Date.now() }];
      // @ts-expect-error
      padRemarksTabEnabled = true; padQaTabEnabled = true;
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([1]); inlineExpandQaNodeIds = new Set([1]);
      // @ts-expect-error
      setPadEnabled(true, false);
      // @ts-expect-error
      render();
    });

    await expect(page.locator('.node-remark-line .node-inline-open-panel-btn')).toHaveCount(1);
    await expect(page.locator('.node-qa-line .node-inline-open-panel-btn')).toHaveCount(1);
  });
});
