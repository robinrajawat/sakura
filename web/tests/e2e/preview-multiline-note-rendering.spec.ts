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

// node.note holds real HTML (the inline .node-note-line editor is contenteditable, same as
// remarks/Q&A/Pad -- see its rewrite in render()), with real <br>/<div> elements marking line
// breaks exactly the way the browser's own Enter/Shift+Enter handling produces them. Presenter/
// Preview's note rendering (both the inline-plain and block-card paths, and the single
// choke point splitNoteDiagramImages the PDF export also uses) sets this HTML directly
// via innerHTML with no conversion step -- these tests exercise noteIsPlainTextOnly/
// noteIsSingleLine's classification of real HTML shapes, not a legacy plain-text bridge.
test.describe('A multi-line rich-HTML note renders correctly in Presenter/Preview', () => {
  test('several real <br> line breaks render as a block card, not squashed inline', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Ad-hoc project-site address<br>Country + Postal Code<br>Transportation-zone determination<br>Route');

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

  // A literal "<"/">" typed into the contenteditable note-line is just text content as far as the
  // DOM is concerned -- reading it back via .innerHTML (exactly what the note-line's own input
  // handler does to persist node.note) always serializes it back out as &lt;/&gt; entities, the
  // same as any other HTML source. This confirms that already-escaped HTML renders back as the
  // literal characters rather than being mangled by a second escaping (or de-escaping) pass
  // somewhere between node.note and the screen.
  test('a literal "<" or ">" already escaped as entities (as real contenteditable HTML would store it) renders as plain characters', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Only valid if x &lt; 5 and y &gt; 10<br>Second line');

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      const block = doc.querySelector('.pv-inline-note-body');
      return { blockText: block ? block.textContent : null };
    });

    expect(result.blockText).toBe('Only valid if x < 5 and y > 10Second line');
  });

  // .pv-inline-note-body's white-space:pre-wrap preserves a literal leading space right after a
  // <br> (e.g. an ASCII flowchart's connector characters, manually indented) exactly as authored
  // -- without it, the browser's default white-space:normal collapses leading whitespace at the
  // start of each line, so the space would exist in the DOM but never actually paint.
  test('a leading space right after a line break (manual indentation) is not collapsed away by default white-space rules', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, 'Ad-hoc project-site address<br> | Country + Postal Code<br>Route');

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      const block = doc.querySelector('.pv-inline-note-body')!;
      return {
        whiteSpace: getComputedStyle(block).whiteSpace,
        innerHTML: block.innerHTML,
      };
    });

    // pre-wrap is what actually makes the browser paint whitespace exactly as authored --
    // without it, the leading space below would exist in the DOM but never render.
    expect(result.whiteSpace).toBe('pre-wrap');
    expect(result.innerHTML).toBe('Ad-hoc project-site address<br> | Country + Postal Code<br>Route');
  });
});
