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
    // The Pad toggle only shows with a document actually open (updatePadVisibility's
    // canShow = padEnabled && !!currentDocId) -- without this, re-enabling the feature
    // flag alone wouldn't bring the button back, regardless of this fix.
    // @ts-expect-error
    currentDocId = 'test-doc';
    // @ts-expect-error
    render();
  });
}

// The four floating editor-corner toggles (maximize/pad/toolbar/preview) used to each be
// individually position:absolute at a hardcoded `right` offset, so hiding one via a feature
// toggle (body.feature-off-pad on #editor-pad-toggle) left a dead gap instead of the remaining
// buttons closing up. They now share one flex row (#editor-floating-controls) that collapses
// automatically around whichever buttons are actually visible.
test.describe('Floating editor-corner toggles close the gap when one is hidden', () => {
  test('the remaining buttons sit adjacent once Pad is turned off', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const gapWithPad = await page.evaluate(() => {
      const zen = document.getElementById('editor-zen-toggle')!.getBoundingClientRect();
      const pad = document.getElementById('editor-pad-toggle')!.getBoundingClientRect();
      return zen.left - pad.right; // pad sits to the left of zen in DOM/visual order (row-reverse)
    });
    expect(gapWithPad).toBeGreaterThan(0);
    expect(gapWithPad).toBeLessThan(12);

    await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('pad', false);
    });

    const padBtn = page.locator('#editor-pad-toggle');
    await expect(padBtn).toBeHidden();

    // With Pad gone, the toolbar toggle becomes zen's immediate neighbor. The gap between them
    // should match the row's own 8px gap, not the ~44px a hidden button used to leave behind.
    const gap = await page.evaluate(() => {
      const zen = document.getElementById('editor-zen-toggle')!.getBoundingClientRect();
      const toolbar = document.getElementById('editor-toolbar-toggle')!.getBoundingClientRect();
      return zen.left - toolbar.right;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(12);

    await page.evaluate(() => {
      // @ts-expect-error
      setFeatureEnabled('pad', true);
    });
    await expect(padBtn).toBeVisible();
  });
});
