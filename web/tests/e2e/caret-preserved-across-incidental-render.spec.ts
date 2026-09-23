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

// render() rebuilds every row's DOM from scratch even for a re-render that has nothing to do
// with the current edit (flashNode's own delayed re-render, ~700ms later, purely to drop the
// flash-new class after Enter splits a node). The render() tail used to unconditionally reset
// the caret to the end of the text whenever its own `inputCaret` instruction slot was empty --
// correct right after a genuine beginEdit/beginEditAt call, but wrong for this kind of incidental
// re-render, where it silently snapped the caret away from wherever the user had actually left it
// (reported as the cursor "jumping" to the end on its own moments after splitting a row).
test.describe('The caret survives an incidental render() mid-edit instead of jumping to the end', () => {
  test('an incidental render() while typing preserves the live caret position, not the end of the text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Hello', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 2); // caret between "He" and "llo"
    });

    const input = page.locator('#in-1');
    await expect(input).toBeVisible();
    await input.focus();

    // Some unrelated code calls render() again while the user is mid-edit (e.g. flashNode's
    // delayed cleanup, an autosave-triggered refresh) -- the DOM is fully torn down and rebuilt,
    // but nothing about the edit itself changed.
    await page.evaluate(() => {
      // @ts-expect-error
      render();
    });

    const caret = await page.locator('#in-1').evaluate((el) =>
      // @ts-expect-error
      getEditableCaretOffset(el)
    );
    expect(caret).toBe(2); // still where the user left it, not snapped to the end (5)
  });

  test('splitting a node mid-text, then the flashNode timeout firing 700ms later, does not move the caret to the end', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'FooBar', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 3); // caret between "Foo" and "Bar"
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('Enter'); // splits into "Foo" / "Bar", caret lands at start (0) of the new "Bar" row

    // @ts-expect-error
    const newId: number = await page.evaluate(() => nodes[1].id);
    const newInput = page.locator(`#in-${newId}`);
    await expect(newInput).toBeVisible();
    await newInput.focus();

    let caret = await newInput.evaluate((el) =>
      // @ts-expect-error
      getEditableCaretOffset(el)
    );
    expect(caret).toBe(0);

    // The user immediately continues typing right where the caret landed, exactly the
    // "continuous editor feel" this is meant to preserve.
    await page.keyboard.type('X');
    caret = await newInput.evaluate((el) =>
      // @ts-expect-error
      getEditableCaretOffset(el)
    );
    expect(caret).toBe(1); // "XBar", caret after the X

    // flashNode's own 700ms timeout now fires and calls render() purely to drop the flash-new
    // class -- this must not disturb the caret the user is actively typing at. Triggered
    // directly here (rather than a real 700ms wall-clock wait) to exercise exactly that code
    // path deterministically, without risking collision with unrelated app timers (e.g. a
    // first-run welcome tour) that could themselves steal focus in that window.
    await page.evaluate(() => {
      // @ts-expect-error
      clearTimeout(flashTimer);
      // @ts-expect-error
      if (flashNodeId !== null) { flashNodeId = null; render(); }
    });
    caret = await page.locator(`#in-${newId}`).evaluate((el) =>
      // @ts-expect-error
      getEditableCaretOffset(el)
    );
    expect(caret).toBe(1); // still right after the X, not jumped to the end of "XBar" (4)
  });
});
