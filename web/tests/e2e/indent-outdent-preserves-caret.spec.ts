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

// Continuous-editing feel: Tab/Shift+Tab (indent/outdent) never change a row's own text, so the
// caret should stay exactly where the user left it -- not jump to the end of the row the way a
// fresh beginEdit(id, true) normally would. It used to always re-enter edit mode at the end after
// indenting, discarding the caret's actual position mid-word.
test.describe('Tab/Shift+Tab (indent/outdent) preserve the caret position instead of jumping to the end', () => {
  test('Tab (indent) keeps the caret at the same offset mid-text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'HelloWorld', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(2, 5); // caret between "Hello" and "World"
    });

    const input = page.locator('#in-2');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('Tab');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      depth: nodes[1].depth,
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-2')),
    }));
    expect(state.depth).toBe(1); // actually indented
    expect(state.editingId).toBe(2); // still editing the same node
    expect(state.caret).toBe(5); // caret unchanged, not snapped to the end (10)
  });

  test('Shift+Tab (outdent) keeps the caret at the same offset mid-text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'HelloWorld', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(2, 5);
    });

    const input = page.locator('#in-2');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('Shift+Tab');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      depth: nodes[1].depth,
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-2')),
    }));
    expect(state.depth).toBe(0);
    expect(state.editingId).toBe(2);
    expect(state.caret).toBe(5);
  });
});
