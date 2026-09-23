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

// Enter now splits a node's text at the caret (continuous editor feel, mirroring the
// backspace-merge feature): text before the caret stays on the node, text after the caret
// becomes a new sibling below it. Ctrl/Cmd+Enter (child creation) and Shift+Enter (inline note)
// are untouched, and Enter at the very end of the text still just appends a blank sibling.
test.describe('Enter splits a node at the caret into a new sibling (continuous editor feel)', () => {
  test('splitting mid-text keeps the before-text and moves the after-text to a new sibling', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Hello World', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      nextId = 2; // must exceed every manually-assigned id above, or the new sibling collides
      // @ts-expect-error
      render();
      const undoDepthBefore = undoStack.length;

      // @ts-expect-error
      splitNodeAtCursorAndFocus(1, 'Hello', ' World');

      const focusedInput = document.getElementById(
        // @ts-expect-error
        'in-' + nodes[1].id
      );
      // @ts-expect-error
      const domCaretOffset = focusedInput ? getEditableCaretOffset(focusedInput) : null;

      return {
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        depths: nodes.map((n: any) => n.depth),
        undoStackGrew: undoStack.length > undoDepthBefore,
        // @ts-expect-error
        editingId,
        isFocused: document.activeElement === focusedInput,
        domCaretOffset,
        renderedRows: document.querySelectorAll('.node-row').length
      };
    });

    expect(result.texts).toEqual(['Hello', ' World']);
    expect(result.depths).toEqual([0, 0]);
    expect(result.undoStackGrew).toBe(true);
    expect(result.isFocused).toBe(true);
    expect(result.domCaretOffset).toBe(0);
    expect(result.renderedRows).toBe(2);
    expect(unexpectedErrors).toEqual([]);
  });

  test('splitting a node with children inserts the new sibling after the whole subtree, never reparenting the children', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent text', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = [];
      // @ts-expect-error
      nextId = 3; // must exceed every manually-assigned id above, or the new sibling collides
      // @ts-expect-error
      render();

      // @ts-expect-error
      splitNodeAtCursorAndFocus(1, 'Parent', ' text');

      return {
        // @ts-expect-error
        ids: nodes.map((n: any) => n.id),
        // @ts-expect-error
        texts: nodes.map((n: any) => n.text),
        // @ts-expect-error
        depths: nodes.map((n: any) => n.depth),
        // @ts-expect-error
        parentIds: nodes.map((n: any) => n.parentId)
      };
    });

    // The new sibling (the split-off " text") must land AFTER the child, at depth 0 -- not as
    // a sibling of the child inside the subtree.
    expect(result.texts).toEqual(['Parent', 'Child', ' text']);
    expect(result.depths).toEqual([0, 1, 0]);
    expect(result.parentIds).toEqual([null, 1, null]);
  });

  test('real keyboard integration: Enter mid-text splits; Enter at the end of the last row adds a blank child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'FooBar', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2; // must exceed every manually-assigned id above, or the new sibling collides
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 3); // caret between "Foo" and "Bar"
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('Enter');

    const afterSplit = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      editingId
    }));
    expect(afterSplit.texts).toEqual(['Foo', 'Bar']);
    // Focus should have moved to the new sibling holding the after-cursor text.
    // @ts-expect-error
    const newId = await page.evaluate(() => nodes[1].id);
    expect(afterSplit.editingId).toBe(newId);

    // Enter at the end of the (now-focused, empty-caret-at-end) node -- which is now the last
    // row in the whole document -- adds a blank CHILD rather than a same-depth sibling (see
    // enter-child-outdent-cascade.spec.ts for the full behavior this enables).
    const input2 = page.locator(`#in-${newId}`);
    await expect(input2).toBeVisible();
    await input2.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    const afterTrailingEnter = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      parentIds: nodes.map((n: any) => n.parentId)
    }));
    expect(afterTrailingEnter.texts).toEqual(['Foo', 'Bar', '']);
    expect(afterTrailingEnter.depths).toEqual([0, 0, 1]);
    expect(afterTrailingEnter.parentIds).toEqual([null, null, newId]);
  });

  test('Ctrl/Cmd+Enter still creates a child, unaffected by the split behavior', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2; // must exceed every manually-assigned id above, or the new child collides
      // @ts-expect-error
      render();
      // @ts-expect-error
      beginEditAt(1, 3); // caret mid-text -- must NOT trigger a split when a modifier is held
    });

    const input1 = page.locator('#in-1');
    await expect(input1).toBeVisible();
    await input1.focus();
    await page.keyboard.press('ControlOrMeta+Enter');

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      parentIds: nodes.map((n: any) => n.parentId)
    }));

    expect(result.texts).toEqual(['Parent', '']);
    expect(result.depths).toEqual([0, 1]);
    expect(result.parentIds).toEqual([null, 1]);
  });
});
