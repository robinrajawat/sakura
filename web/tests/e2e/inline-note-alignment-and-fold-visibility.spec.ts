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

// Three related bugs in the inline Note/Remark/Q&A lines rendered directly under a row:
// 1. Their own paddingLeft formula used a trailing offset that didn't match where the row's own
//    text actually starts (the dot/fold-icon width plus its margin past the depth base), so every
//    inline note/remark/Q&A line sat off to the left of the text it's describing instead of
//    lining up under it. This constant needs revisiting any time the leading dot/icon area's
//    own width changes (e.g. when the separate drag-handle icon was removed in favor of a
//    long-press-anywhere drag gesture, which shifted every row's text start left).
// 2. All three were unconditionally hidden whenever their node was folded (`&&!folded`), even
//    though folding only hides a node's CHILDREN -- a note/remark/Q&A that belongs to the folded
//    node itself has nothing to do with whether its children are shown.
// 3. Both ways of opening a node's note (the toggleNote shortcut/toolbar/menu path via
//    openInlineNoteAndFocus, and Shift+Enter while already editing the node's own text) called
//    expandNode(id) before showing it -- forcing a folded node's hidden children open too, just
//    to add a note that has nothing to do with them. Since (2) already means the note shows
//    fine on a folded row, that expandNode call was pure unwanted side effect.
test.describe('Inline note/remark/Q&A lines align with row text and survive folding', () => {
  test('an expanded inline note lines up exactly under the row\'s own text', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Cutover', styles: {}, note: 'This we will have to check' }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      inlineExpandNoteNodeIds = new Set([1]);
      // @ts-expect-error
      render();

      const row = document.querySelector('.node-row[data-id="1"]')!;
      const label = row.querySelector('.node-label')!;
      const noteLine = document.querySelector('#note-line-1') as HTMLTextAreaElement;
      const rowRect = row.getBoundingClientRect();
      return {
        labelLeft: label.getBoundingClientRect().left - rowRect.left,
        notePaddingLeft: parseFloat(noteLine.style.paddingLeft),
      };
    });

    expect(result.notePaddingLeft).toBeCloseTo(result.labelLeft, 0);
  });

  test('a folded node still shows its own inline note, remark, and Q&A -- only its children stay hidden', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {}, note: 'Note on the folded node' },
        { id: 2, depth: 1, text: 'Hidden child', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      inlineExpandNoteNodeIds = new Set([1]);
      // @ts-expect-error
      remarks = [{ id: 'r1', anchorNodeId: 1, text: 'A remark', person: 'Someone', date: new Date().toISOString() }];
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([1]);
      // @ts-expect-error
      qaItems = [{ id: 'q1', sourceNodeId: 1, question: 'A question', answer: '' }];
      // @ts-expect-error
      inlineExpandQaNodeIds = new Set([1]);
      // @ts-expect-error
      render();

      return {
        parentRowVisible: !!document.querySelector('.node-row[data-id="1"]'),
        childRowHidden: !document.querySelector('.node-row[data-id="2"]'),
        noteVisible: !!document.querySelector('#note-line-1'),
        remarkVisible: !!document.querySelector('.node-remark-line'),
        qaVisible: !!document.querySelector('.node-qa-line'),
      };
    });

    expect(result.parentRowVisible).toBe(true);
    expect(result.childRowHidden).toBe(true); // fold still hides the actual child
    expect(result.noteVisible).toBe(true); // but the parent's own note/remark/Q&A stay visible
    expect(result.remarkVisible).toBe(true);
    expect(result.qaVisible).toBe(true);
  });

  test('opening a folded node\'s note via the shortcut/menu path does not expand its hidden children', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Hidden child', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      openInlineNoteAndFocus(1);
      return {
        // @ts-expect-error
        stillCollapsed: collapsedIds.has(1),
        noteVisible: !!document.querySelector('.node-note-line[data-node-id="1"]'),
        childVisible: !!document.querySelector('.node-row[data-id="2"]'),
      };
    });

    expect(result.stillCollapsed).toBe(true);
    expect(result.noteVisible).toBe(true);
    expect(result.childVisible).toBe(false);
  });

  test('Shift+Enter while editing a folded node\'s own text opens its note without expanding its hidden children', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Hidden child', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
    });
    await page.dblclick('.node-row[data-id="1"] .node-label');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(100);

    const result = await page.evaluate(() => ({
      // @ts-expect-error
      stillCollapsed: collapsedIds.has(1),
      noteVisible: !!document.querySelector('.node-note-line[data-node-id="1"]'),
      childVisible: !!document.querySelector('.node-row[data-id="2"]'),
    }));

    expect(result.stillCollapsed).toBe(true);
    expect(result.noteVisible).toBe(true);
    expect(result.childVisible).toBe(false);
  });
});
