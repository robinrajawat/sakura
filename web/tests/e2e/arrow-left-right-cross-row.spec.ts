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

// Continuous editor feel, mirroring the existing ArrowUp/ArrowDown cross-row caret movement and
// the Backspace-merge/Enter-outdent fixes: ArrowRight at the very end of a row's text now moves
// the caret to the START of the next VISIBLE row instead of doing nothing, and ArrowLeft at the
// very start of a row's text moves the caret to the END of the previous VISIBLE row -- both
// skipping hidden descendants of a collapsed node, exactly like the existing visible-row helpers
// used elsewhere (getVisibleNodeIndexes).
test.describe('ArrowLeft/ArrowRight cross into the adjacent visible row at text boundaries', () => {
  test('ArrowRight at the end of a row moves the caret to the start of the next visible row', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 'First'.length);
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('ArrowRight');

    const state = await page.evaluate(() => {
      const el = document.getElementById('in-2');
      return {
        // @ts-expect-error
        editingId,
        isFocused: document.activeElement === el,
        // @ts-expect-error
        caret: el ? getEditableCaretOffset(el) : null,
      };
    });
    expect(state.editingId).toBe(2);
    expect(state.isFocused).toBe(true);
    expect(state.caret).toBe(0);
  });

  test('ArrowLeft at the start of a row moves the caret to the end of the previous visible row', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(2, 0);
    });

    const input2 = page.locator('#in-2');
    await expect(input2).toBeVisible();
    await input2.focus();
    await page.keyboard.press('ArrowLeft');

    const state = await page.evaluate(() => {
      const el = document.getElementById('in-1');
      return {
        // @ts-expect-error
        editingId,
        isFocused: document.activeElement === el,
        // @ts-expect-error
        caret: el ? getEditableCaretOffset(el) : null,
      };
    });
    expect(state.editingId).toBe(1);
    expect(state.isFocused).toBe(true);
    expect(state.caret).toBe('First'.length);
  });

  test('ArrowRight mid-text and ArrowLeft mid-text just move the caret within the row, no row change', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'FooBar', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 3); // caret between "Foo" and "Bar" -- neither boundary
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('ArrowRight');

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-1')),
    }));
    expect(state.editingId).toBe(1); // still on the same row
    expect(state.caret).toBe(4);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-1')),
    }));
    expect(state.editingId).toBe(1);
    expect(state.caret).toBe(2);
  });

  test('crossing skips a collapsed node\'s hidden children (both directions)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // Parent (id 1, collapsed) has a hidden child (id 2) -- id 3 is the next visible sibling
      // after the whole collapsed subtree. Crossing must never land inside the hidden child.
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Hidden child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Rest', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 'Parent'.length);
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('ArrowRight');

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-3')),
    }));
    expect(state.editingId).toBe(3); // never id 2, the hidden child
    expect(state.caret).toBe(0);

    // And back the other way: ArrowLeft from id 3's start must land on id 1 (the collapsed
    // parent's own visible row), not descend into its hidden child.
    await page.keyboard.press('ArrowLeft');

    state = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-1')),
    }));
    expect(state.editingId).toBe(1);
    expect(state.caret).toBe('Parent'.length);
  });

  test('ArrowRight on the last row is a no-op (nothing to cross into); ArrowLeft on the first row crosses into the title', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      const titleInput = document.getElementById('header-title') as HTMLInputElement;
      titleInput.value = 'Doc title';
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Only', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 'Only'.length);
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('ArrowRight'); // end of the only (last) row -- nowhere to go

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      // @ts-expect-error
      caret: getEditableCaretOffset(document.getElementById('in-1')),
    }));
    expect(state.editingId).toBe(1);
    expect(state.caret).toBe('Only'.length);

    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 0);
    });
    await input1.focus();
    // Start of the only (first) row -- this now crosses into the title (its own "row -1"),
    // landing at the title's end, instead of staying put.
    await page.keyboard.press('ArrowLeft');

    state = await page.evaluate(() => {
      const t = document.getElementById('header-title') as HTMLInputElement;
      return {
        // @ts-expect-error
        editingId,
        titleFocused: document.activeElement === t,
        titleCaret: t.selectionStart,
        titleLen: t.value.length,
      };
    });
    expect(state.editingId).toBe(null);
    expect(state.titleFocused).toBe(true);
    expect(state.titleCaret).toBe(state.titleLen);
  });
});
