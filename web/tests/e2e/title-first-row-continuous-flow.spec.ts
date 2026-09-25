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

function setUpDoc(page: import('@playwright/test').Page, title: string, firstText: string) {
  return page.evaluate(({ title, firstText }) => {
    const titleInput = document.getElementById('header-title') as HTMLInputElement;
    titleInput.value = title;
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: firstText, parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
      { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
    ];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; editingId = null; undoStack = [];
    // @ts-expect-error
    render();
  }, { title, firstText });
}

// The document title used to be a dead end for the keyboard: Backspace on an empty first row did
// nothing (deleteEmptyNodeAndFocusPrev refused whenever there was no PREVIOUS node, which is
// always true at the first visible row), and ArrowUp/ArrowLeft out of the first row, or
// ArrowDown/ArrowRight out of the title, simply had no effect. Dynalist treats the title as the
// outline's own "row -1": this suite covers making that same continuous flow true here.
test.describe('Title acts as the outline\'s row -1 for keyboard flow', () => {
  test('Backspace on an empty first row deletes it and lands the caret at the end of the title', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'My Document', '');

    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 0);
    });
    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('Backspace');

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      ids: nodes.map((n: any) => n.id),
      // @ts-expect-error
      editingId,
      titleFocused: document.activeElement === document.getElementById('header-title'),
      titleCaret: (() => {
        const t = document.getElementById('header-title') as HTMLInputElement;
        return { start: t.selectionStart, end: t.selectionEnd, len: t.value.length };
      })()
    }));

    expect(result.ids).toEqual([2]); // the empty first row is gone, the second row is untouched
    expect(result.editingId).toBe(null);
    expect(result.titleFocused).toBe(true);
    expect(result.titleCaret.start).toBe(result.titleCaret.len);
    expect(result.titleCaret.end).toBe(result.titleCaret.len);
  });

  test('ArrowDown from the title moves into the first row, at the corresponding column', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'My Document', 'Hello world');

    const titleInput = page.locator('#header-title');
    await titleInput.focus();
    await page.evaluate(() => {
      const t = document.getElementById('header-title') as HTMLInputElement;
      t.setSelectionRange(3, 3); // caret after "My "
    });
    await page.keyboard.press('ArrowDown');

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      caretOffset: (() => {
        const input = document.getElementById('in-1');
        // @ts-expect-error
        return input ? getEditableCaretOffset(input) : null;
      })()
    }));
    expect(result.editingId).toBe(1);
    expect(result.caretOffset).toBe(3);
  });

  test('ArrowUp from the first row (caret at its start) moves back into the title', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'My Document', 'Hello world');

    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 4);
    });
    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('ArrowUp');

    const result = await page.evaluate(() => {
      const t = document.getElementById('header-title') as HTMLInputElement;
      return {
        // @ts-expect-error
        editingId,
        titleFocused: document.activeElement === t,
        caret: t.selectionStart
      };
    });
    expect(result.editingId).toBe(null);
    expect(result.titleFocused).toBe(true);
    expect(result.caret).toBe(4);
  });

  test('ArrowRight at the end of the title moves into the start of the first row', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Title', 'First row text');

    const titleInput = page.locator('#header-title');
    await titleInput.focus();
    await page.evaluate(() => {
      const t = document.getElementById('header-title') as HTMLInputElement;
      t.setSelectionRange(t.value.length, t.value.length);
    });
    await page.keyboard.press('ArrowRight');

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      editingId,
      caretOffset: (() => {
        const input = document.getElementById('in-1');
        // @ts-expect-error
        return input ? getEditableCaretOffset(input) : null;
      })()
    }));
    expect(result.editingId).toBe(1);
    expect(result.caretOffset).toBe(0);
  });

  test('ArrowLeft at the start of the first row moves into the end of the title', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Title', 'First row text');

    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 0);
    });
    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('ArrowLeft');

    const result = await page.evaluate(() => {
      const t = document.getElementById('header-title') as HTMLInputElement;
      return {
        // @ts-expect-error
        editingId,
        titleFocused: document.activeElement === t,
        caret: t.selectionStart,
        len: t.value.length
      };
    });
    expect(result.editingId).toBe(null);
    expect(result.titleFocused).toBe(true);
    expect(result.caret).toBe(result.len);
  });
});
