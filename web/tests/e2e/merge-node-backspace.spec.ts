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

// Backspace at the very start of a node's text now merges it into the previous VISIBLE node
// (mergeNodeIntoPrevAndFocus, alongside the pre-existing empty-node deleteEmptyNodeAndFocusPrev)
// -- the "continuous editor feel" fix: appending onto a collapsed node's own row, never
// descending into that node's hidden last descendant.
test.describe('Backspace-merges a node into the previous visible node (continuous editor feel)', () => {
  test('merging two plain siblings concatenates text and lands the caret at the join point', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Hello ', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 0, text: 'World', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 2; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();
      const undoDepthBefore = undoStack.length;

      // @ts-expect-error
      mergeNodeIntoPrevAndFocus(2, 'World');

      // inputCaret is a one-shot instruction consumed by render() itself (positions the real
      // DOM caret via setInputCaret, then resets to null) -- so the real assertion is the
      // actual DOM caret position on the now-focused input, not the transient global.
      const focusedInput = document.getElementById('in-1');
      // @ts-expect-error
      const domCaretOffset = focusedInput ? getEditableCaretOffset(focusedInput) : null;

      return {
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        ids: nodes.map((n: any) => n.id),
        undoStackGrew: undoStack.length > undoDepthBefore,
        // @ts-expect-error
        editingId,
        isFocused: document.activeElement === focusedInput,
        domCaretOffset,
        renderedRows: document.querySelectorAll('.node-row').length
      };
    });

    expect(result.ids).toEqual([1]);
    expect(result.texts).toEqual(['Hello World']);
    expect(result.undoStackGrew).toBe(true);
    expect(result.editingId).toBe(1);
    expect(result.isFocused).toBe(true);
    expect(result.domCaretOffset).toBe('Hello '.length);
    expect(result.renderedRows).toBe(1);
    expect(unexpectedErrors).toEqual([]);
  });

  test('merging next to a collapsed node appends into the collapsed row itself, not its hidden child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // Parent (id 1) has one child (id 2), collapsed -- id 3 is the next sibling after the
      // whole collapsed subtree. Merging id 3 backward must land on id 1 (the visible row),
      // never id 2 (hidden inside the fold).
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Hidden child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Rest', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = 3; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();

      // @ts-expect-error
      mergeNodeIntoPrevAndFocus(3, 'Rest');

      return {
        // @ts-expect-error
        ids: nodes.map((n: any) => n.id),
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        editingId
      };
    });

    expect(result.ids).toEqual([1, 2]); // id 3 gone, hidden child (id 2) untouched
    expect(result.texts).toEqual(['ParentRest', 'Hidden child']); // merged into the collapsed parent, not its child
    expect(result.editingId).toBe(1);
  });

  test('a node with children refuses to merge (nodeHasChildren guard)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'A', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 0, text: 'B', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 3, depth: 1, text: 'B-child', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 2; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      render();
      const before = { ids: [1, 2, 3], texts: ['A', 'B', 'B-child'] };

      // @ts-expect-error — node 2 has a child (node 3); must be a no-op
      mergeNodeIntoPrevAndFocus(2, 'B');

      return {
        before,
        // @ts-expect-error
        after: { ids: nodes.map((n: any) => n.id), texts: nodes.map((n: any) => n.text) }
      };
    });

    expect(result.after).toEqual(result.before);
  });

  test('real keyboard integration: caret at offset 0 + Backspace merges; caret mid-text does not', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
    });

    // Enter edit mode on node 2 with the caret placed at its very start (offset 0).
    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(2, 0);
    });
    const input = page.locator('#in-2');
    await expect(input).toBeVisible();
    await input.focus();
    await page.keyboard.press('Backspace');

    const merged = await page.evaluate(() => ({
      // @ts-expect-error
      ids: nodes.map((n: any) => n.id),
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      editingId
    }));
    expect(merged.ids).toEqual([1]);
    expect(merged.texts).toEqual(['FirstSecond']);
    expect(merged.editingId).toBe(1);

    // Now the mirror case: caret NOT at offset 0 (end of "FirstSecond") -- Backspace should
    // delete one character in place, never trigger a merge (there's nothing above it anyway,
    // but this also guards the offset check itself: a careless `<=0` instead of `===0` would
    // wrongly fire here too if there were a previous node).
    await page.evaluate(() => {
      // @ts-expect-error
      beginEditAt(1, nodes[0].text.length);
    });
    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('Backspace');
    await page.evaluate(() => {
      // @ts-expect-error
      commitEdit();
    });

    const afterCharDelete = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text)
    }));
    expect(afterCharDelete.texts).toEqual(['FirstSecon']); // one character removed, not a merge
  });
});
