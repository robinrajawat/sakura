import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

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

// Forward-Delete at the very end of a node's text now pulls the next VISIBLE node's text up onto
// this one (mergeNextNodeIntoAndFocus) instead of doing nothing -- the mirror-image continuity
// gap of the existing Backspace-merge fix: on paper, deleting forward at the end of a line pulls
// the next line up without moving where your pen is, and it previously just silently did nothing.
test.describe('Delete pulls the next visible node into this one at the end of the text (continuous editor feel)', () => {
  test('deleting forward at the end of a row concatenates the next row\'s text and leaves the caret at the join point', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Hello ', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'World', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();
      const undoDepthBefore = undoStack.length;

      // @ts-expect-error
      mergeNextNodeIntoAndFocus(1, 'Hello ');

      const focusedInput = document.getElementById('in-1');
      return {
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        ids: nodes.map((n: any) => n.id),
        undoStackGrew: undoStack.length > undoDepthBefore,
        // @ts-expect-error
        editingId,
        isFocused: document.activeElement === focusedInput,
        // @ts-expect-error
        domCaretOffset: focusedInput ? getEditableCaretOffset(focusedInput) : null,
        renderedRows: document.querySelectorAll('.node-row').length,
      };
    });

    expect(result.ids).toEqual([1]);
    expect(result.texts).toEqual(['Hello World']);
    expect(result.undoStackGrew).toBe(true);
    expect(result.editingId).toBe(1);
    expect(result.isFocused).toBe(true);
    expect(result.domCaretOffset).toBe('Hello '.length); // unchanged -- the caret never moves
    expect(result.renderedRows).toBe(1);
    expect(unexpectedErrors).toEqual([]);
  });

  test('deleting forward next to a collapsed node absorbs the sibling AFTER the whole hidden subtree, never the hidden child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // id 1 is collapsed with a hidden child (id 2) -- id 3 is the next VISIBLE sibling after
      // the whole collapsed subtree. Deleting forward from id 1 must land on id 3, never id 2.
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Hidden child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Rest', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();

      // @ts-expect-error
      mergeNextNodeIntoAndFocus(1, 'Parent');

      return {
        // @ts-expect-error
        ids: nodes.map((n: any) => n.id),
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        editingId,
      };
    });

    expect(result.ids).toEqual([1, 2]); // id 3 gone, hidden child (id 2) untouched
    expect(result.texts).toEqual(['ParentRest', 'Hidden child']);
    expect(result.editingId).toBe(1);
  });

  test('a next node with children refuses to merge (nodeHasChildren guard)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'A', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'B', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 3, depth: 1, text: 'B-child', parentId: 2, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();
      const before = { ids: [1, 2, 3], texts: ['A', 'B', 'B-child'] };

      // @ts-expect-error -- node 2 (next after id 1) has a child (node 3); must be a no-op
      mergeNextNodeIntoAndFocus(1, 'A');

      return {
        before,
        // @ts-expect-error
        after: { ids: nodes.map((n: any) => n.id), texts: nodes.map((n: any) => n.text) },
      };
    });

    expect(result.after).toEqual(result.before);
  });

  test('deleting forward when this is the last visible row is a no-op', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Only', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();
      const before = { ids: [1], texts: ['Only'] };

      // @ts-expect-error
      mergeNextNodeIntoAndFocus(1, 'Only');

      return {
        before,
        // @ts-expect-error
        after: { ids: nodes.map((n: any) => n.id), texts: nodes.map((n: any) => n.text) },
      };
    });

    expect(result.after).toEqual(result.before);
  });

  test('real keyboard integration: Delete at end of text merges; Delete mid-text does not', async ({ page }) => {
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
    });

    // Caret at the very end of node 1 ("First") -- Delete should merge in node 2.
    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 'First'.length);
    });
    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('Delete');

    const merged = await page.evaluate(() => ({
      // @ts-expect-error
      ids: nodes.map((n: any) => n.id),
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      editingId,
    }));
    expect(merged.ids).toEqual([1]);
    expect(merged.texts).toEqual(['FirstSecond']);
    expect(merged.editingId).toBe(1);

    // Mirror case: caret NOT at the end (start of "FirstSecond") -- Delete removes one character
    // forward in place, never triggers a merge (guards the offset check itself: a careless
    // `>=len` instead of `===len` would wrongly fire here too).
    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, 0);
    });
    await input1.focus();
    await page.keyboard.press('Delete');
    await page.evaluate(() => {
      // @ts-expect-error
      commitEdit();
    });

    const afterCharDelete = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
    }));
    expect(afterCharDelete.texts).toEqual(['irstSecond']); // one character removed, not a merge
  });
});
