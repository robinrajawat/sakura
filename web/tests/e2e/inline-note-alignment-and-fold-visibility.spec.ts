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

// Two related bugs in the inline Note/Remark/Q&A lines rendered directly under a row:
// 1. Their own paddingLeft formula used a trailing +24px offset left over from before the drag
//    handle became a real layout element -- the row's own text actually starts 36px past the
//    depth base (13px drag handle + 18px dot + 6px dot margin), not 24px, so every inline note/
//    remark/Q&A line sat ~12px to the left of the text it's describing instead of lining up
//    under it.
// 2. All three were unconditionally hidden whenever their node was folded (`&&!folded`), even
//    though folding only hides a node's CHILDREN -- a note/remark/Q&A that belongs to the folded
//    node itself has nothing to do with whether its children are shown.
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
});
