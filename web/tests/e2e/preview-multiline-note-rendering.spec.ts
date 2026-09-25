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

// A depth-0 node is treated as a section when sectionMarkersDepthZero is on (the default) --
// sections always get the block-card note treatment regardless of note shape (see the "Section
// nodes are excluded..." comment in renderPreviewBody), which would mask what these tests are
// actually isolating. Using a depth-1 child keeps the plain-vs-block outcome purely about the
// note's own content, not an unrelated section rule.
function setUpDoc(page: import('@playwright/test').Page, note: string) {
  return page.evaluate((note) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Parent row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'A row with a note', parentId: 1, isCheckbox: false, checked: false, note, noteTitle: '', tags: [], styles: {} }
    ];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    renderPreviewBody();
  }, note);
}

// node.note is guaranteed plain text -- normalizeNode's notePlainTextFromLegacyHtml flattens any
// legacy HTML on load, and the only way to edit it live is the plain <textarea> .node-note-line
// -- but renderPreviewBody's note rendering (both the inline-plain and block-card paths) was
// written for the OLD rich-HTML note format and set the raw text directly via innerHTML. A '\n'
// character has no visual effect there (unlike the live textarea, which preserves it natively),
// so a genuinely multi-line note -- several manual line breaks, or several saveNodeComment
// entries joined with '\n\n' -- silently collapsed onto one run-on line in Presenter/Preview, and
// the "is this a single-line note" classification never caught it either, since plain text never
// has the <br>/block-children the check was looking for. Fixed by escaping the text and
// converting '\n' to real <br> tags once, at the single choke point (splitNoteDiagramImages)
// Presenter/Preview, Word export, and PPTX export all already route through.
test.describe('A multi-line plain-text note renders correctly in Presenter/Preview', () => {
  test('several manual line breaks render as a block card with real <br> line breaks, not squashed inline', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Ad-hoc project-site address\nCountry + Postal Code\nTransportation-zone determination\nRoute');

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      const inlineFull = doc.querySelector('.pv-note-inline-full');
      const block = doc.querySelector('.pv-inline-note-body');
      return {
        hasInline: !!inlineFull,
        hasBlock: !!block,
        blockText: block ? block.textContent : null,
        blockBrCount: block ? block.querySelectorAll('br').length : 0,
      };
    });

    expect(result.hasInline).toBe(false); // must NOT use the single-line inline teaser
    expect(result.hasBlock).toBe(true); // must get the full "Note" card instead
    expect(result.blockBrCount).toBe(3); // 4 lines -> 3 line breaks, not one run-on line
    expect(result.blockText).toBe('Ad-hoc project-site addressCountry + Postal CodeTransportation-zone determinationRoute');
  });

  test('a genuinely single-line note still renders inline, unaffected', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'A short one-line note');

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      return {
        hasInline: !!doc.querySelector('.pv-note-inline-full'),
        hasBlock: !!doc.querySelector('.pv-inline-note-body'),
        inlineText: doc.querySelector('.pv-note-inline-full')?.textContent,
      };
    });

    expect(result.hasInline).toBe(true);
    expect(result.hasBlock).toBe(false);
    expect(result.inlineText).toBe('A short one-line note');
  });

  test('a literal "<" or ">" typed in a note is escaped, not parsed as markup', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Only valid if x < 5 and y > 10\nSecond line');

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      const block = doc.querySelector('.pv-inline-note-body');
      return { blockText: block ? block.textContent : null };
    });

    expect(result.blockText).toBe('Only valid if x < 5 and y > 10Second line');
  });
});
