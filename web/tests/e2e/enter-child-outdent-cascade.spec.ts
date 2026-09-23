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

// Continuous-editing feel, part 3: pressing Enter at the very end of the LAST row in the whole
// document (nothing follows it anywhere, at any depth) now adds a blank CHILD instead of a
// same-depth sibling. Since that new row is blank, pressing Enter again on it walks it back out
// one level at a time (the same guard deleteEmptyNodeAndFocusPrev/mergeNodeIntoPrevAndFocus use
// for "previous visible row" doesn't apply here -- this is forward, not backward) until it
// reaches depth 0, at which point further Enter presses just keep adding blank rows at depth 0
// rather than refusing, exactly like Enter on a blank row anywhere else in the document already
// does. A blank Enter that is NOT on the last row (there's content after it) is unaffected --
// it always just adds another blank row at the same depth.
test.describe('Enter at the end of the document adds a child, then repeated blank Enter outdents back to depth 0', () => {
  test('Enter at the end of the single node in a fresh document adds a blank child, not a sibling', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 'Root'.length); // caret at the very end
      return { ok: true };
    });
    expect(result.ok).toBe(true);

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('Enter');

    const after = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      parentIds: nodes.map((n: any) => n.parentId),
      // @ts-expect-error
      editingId
    }));
    expect(after.texts).toEqual(['Root', '']);
    expect(after.depths).toEqual([0, 1]);
    expect(after.parentIds).toEqual([null, 1]);
    // @ts-expect-error
    const newId = await page.evaluate(() => nodes[1].id);
    expect(after.editingId).toBe(newId);
  });

  test('repeated blank Enter on the trailing child walks it back out to depth 0, then keeps adding blank rows', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // Start three levels deep so there's real outdenting to walk through: Root > Mid > Leaf,
    // caret at the end of Leaf (the last row of the document, depth 2).
    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Mid', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 3, depth: 2, text: 'Leaf', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 4;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(3, 'Leaf'.length);
    });

    const leafInput = page.locator('#in-3');
    await expect(leafInput).toBeVisible();
    await leafInput.focus();
    await page.keyboard.press('Enter'); // creates a blank child of Leaf, at depth 3

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text)
    }));
    expect(state.depths).toEqual([0, 1, 2, 3]);
    expect(state.texts).toEqual(['Root', 'Mid', 'Leaf', '']);

    // @ts-expect-error
    const blankId: number = await page.evaluate(() => nodes[3].id);
    const blankInput = page.locator(`#in-${blankId}`);

    // Enter #1 on the blank row: outdent from depth 3 -> depth 2.
    await expect(blankInput).toBeVisible();
    await blankInput.focus();
    await page.keyboard.press('Enter');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      count: nodes.length
    }));
    expect(state.count).toBe(4); // still the same blank row, just outdented -- not a new one
    expect(state.depths).toEqual([0, 1, 2, 2]);

    // Enter #2: depth 2 -> 1.
    await page.keyboard.press('Enter');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      count: nodes.length
    }));
    expect(state.count).toBe(4);
    expect(state.depths).toEqual([0, 1, 2, 1]);

    // Enter #3: depth 1 -> 0.
    await page.keyboard.press('Enter');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      count: nodes.length
    }));
    expect(state.count).toBe(4);
    expect(state.depths).toEqual([0, 1, 2, 0]);

    // Enter #4: already at depth 0 -- no more outdenting possible, so this now adds ANOTHER
    // blank row at depth 0 instead of refusing (the "currently we restrict it" bug).
    await page.keyboard.press('Enter');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      count: nodes.length
    }));
    expect(state.count).toBe(5);
    expect(state.depths).toEqual([0, 1, 2, 0, 0]);
    expect(state.texts).toEqual(['Root', 'Mid', 'Leaf', '', '']);

    // Enter #5: still depth 0 -- keeps adding more blank rows, not a dead end.
    await page.keyboard.press('Enter');
    state = await page.evaluate(() => ({
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      count: nodes.length
    }));
    expect(state.count).toBe(6);
    expect(state.depths).toEqual([0, 1, 2, 0, 0, 0]);
  });

  test('a blank Enter that is NOT on the last row of the document just adds a same-depth sibling (unaffected)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Nested', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Last', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 4;
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(2, 'Nested'.length); // end of the middle (depth-1) row -- NOT the last row
    });

    const input2 = page.locator('#in-2');
    await expect(input2).toBeVisible();
    await input2.focus();
    await page.keyboard.press('Enter'); // creates a blank row -- id 2 is not the doc's last row

    let state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth)
    }));
    expect(state.texts).toEqual(['First', 'Nested', '', 'Last']);
    expect(state.depths).toEqual([0, 1, 1, 0]); // blank sibling at the SAME depth as Nested (1)

    // @ts-expect-error
    const blankId: number = await page.evaluate(() => nodes[2].id);
    const blankInput = page.locator(`#in-${blankId}`);
    await expect(blankInput).toBeVisible();
    await blankInput.focus();
    await page.keyboard.press('Enter'); // this blank row is still not the doc's last row (Last follows it)

    state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth)
    }));
    // Just another blank row at the same depth -- no outdenting, since this was never the
    // last row of the document to begin with.
    expect(state.texts).toEqual(['First', 'Nested', '', '', 'Last']);
    expect(state.depths).toEqual([0, 1, 1, 1, 0]);
  });
});
