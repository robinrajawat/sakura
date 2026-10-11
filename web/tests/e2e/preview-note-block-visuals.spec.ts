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

function setUpDoc(page: import('@playwright/test').Page, note: string) {
  return page.evaluate((note) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Parent row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'A row with block-level content in its note', parentId: 1, isCheckbox: false, checked: false, note, noteTitle: '', tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    previewActive = true;
    // @ts-expect-error
    renderPreviewBody();
    document.getElementById('preview-overlay')?.classList.add('open');
  }, note);
}

const img1x1 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';

// Tables/images embedded in a note's rich text used to render inside the same scrollable,
// max-height:340px box as plain text -- squeezed in next to the exact same content types that
// get their own full-width figure everywhere else in a note (a note-embedded diagram, a Pad
// "Feature under node" table). splitNoteBlockVisuals pulls block-level tables and standalone
// images out of a note's text into that same figure treatment, leaving only real text behind.
test.describe('Block-level tables and images in a note render as their own full-width figures, not squeezed into the note text box', () => {
  test('a table inside note text renders as its own figure, outside the note card', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, '<p>Some context.</p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><p>More context.</p>');

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const noteBody = body.querySelector('.pv-inline-note-body');
      return {
        tableOutsideBox: !!body.querySelector('.pv-table-figure table'),
        tableInsideBox: !!noteBody?.querySelector('table'),
        noteBodyText: noteBody?.textContent?.trim(),
      };
    });
    expect(result.tableOutsideBox).toBe(true);
    expect(result.tableInsideBox).toBe(false);
    expect(result.noteBodyText).toContain('Some context.');
    expect(result.noteBodyText).toContain('More context.');
  });

  test('a standalone (block-level) image in note text renders as its own figure, outside the note card', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, `<p>Before.</p><p><img src="${img1x1}" alt="Standalone"></p><p>After.</p>`);

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const noteBody = body.querySelector('.pv-inline-note-body');
      return {
        imgOutsideBox: !!body.querySelector('.pv-diagram-figure > img.pv-diagram-img'),
        imgInsideBox: !!noteBody?.querySelector('img'),
      };
    });
    expect(result.imgOutsideBox).toBe(true);
    expect(result.imgInsideBox).toBe(false);
  });

  // Every picture with a usable src is a node.images object now (migrateNoteImagesToNode), even
  // one that sat mid-sentence: it becomes the node's figure, and the sentence's text stays intact.
  test('an inline image sitting mid-sentence moves to node.images, leaving the sentence text intact', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, `<p>Look at this <img src="${img1x1}" alt="inline"> icon right here.</p>`);

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const noteBody = body.querySelector('.pv-inline-note-body');
      // With the picture gone the note is one plain line, so the PDF shows it inline after the
      // node's text rather than as a separate card.
      return {
        imgInsideBox: !!noteBody?.querySelector('img'),
        figureCount: body.querySelectorAll('.pv-node-image-figure').length,
        imgsOutsideFigures: [...body.querySelectorAll('img')].filter((i) => !i.closest('.pv-node-image-figure')).length,
        text: body.textContent?.replace(/\s+/g, ' '),
      };
    });
    expect(result.imgInsideBox).toBe(false);
    expect(result.figureCount).toBe(1);
    expect(result.imgsOutsideFigures).toBe(0);
    expect(result.text).toContain('Look at this icon right here.');
  });

  test('a note that is entirely a table, with no text at all, renders only the figure -- no empty "Note" card', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      return {
        hasTableFigure: !!body.querySelector('.pv-table-figure'),
        hasNoteLabel: !!body.querySelector('.pv-inline-label-note'),
      };
    });
    expect(result.hasTableFigure).toBe(true);
    expect(result.hasNoteLabel).toBe(false);
  });

  test('a chart-featured table still renders as its chart when pulled out into its own figure', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const chartNote = '<p>Some text.</p><table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>';
    await setUpDoc(page, chartNote);

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const fig = body.querySelector('.pv-table-chart-figure[data-note-chart-node-id]');
      return { hasChartFigure: !!fig, hasSvg: !!fig?.querySelector('svg') };
    });
    expect(result.hasChartFigure).toBe(true);
    expect(result.hasSvg).toBe(true);
  });

  // A right-click-to-feature-as-chart test used to live here, exercising openChartCtxMenu/
  // #chart-ctx-menu -- Preview-overlay-only chrome removed along with the rest of the
  // interactive Preview overlay (#preview-body is now headless, permanently display:none
  // outside exportPreviewAsPdf's own print pass, so there is nothing on screen to right-click).
  // The same "feature as chart" action on a table pulled out of a note is still covered via the
  // live editor's own right-click menu in tests/e2e/inline-note-rich-text.spec.ts.

  // The synthetic <p><img></p> markup the other tests above use is one real shape a note's HTML
  // can take, but not the actual shape document.execCommand('insertImage') produces (see the
  // note-line's own paste handler) -- that inserts the <img> as a bare root-level child, no <p>
  // wrapper at all, which is the normal, real-world way a picture ends up in a note. Pasting a
  // real image through the live editor and checking what actually lands in node.note (then
  // feeding that through splitNoteBlockVisuals, same as renderPreviewBody does) catches the gap
  // the synthetic-markup tests above couldn't.
  test('a real pasted image lands in node.images and renders as a PDF figure, never inside the note card', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'A row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      inlineExpandNoteNodeIds = new Set([1]);
      // @ts-expect-error
      forceInlineNoteId = 1;
      // @ts-expect-error
      render();
    });

    await page.locator('#note-line-1').click();
    await page.evaluate(() => {
      const el = document.getElementById('note-line-1')!;
      const pngBytes = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
      const bytes = new Uint8Array(pngBytes.length);
      for (let i = 0; i < pngBytes.length; i++) bytes[i] = pngBytes.charCodeAt(i);
      const file = new File([bytes], 'shot.png', { type: 'image/png' });
      const clipboardData = { getData: () => '', items: [{ type: 'image/png', getAsFile: () => file }] };
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clipboardData', { value: clipboardData });
      el.dispatchEvent(ev);
    });
    await expect.poll(() => page.evaluate(() => {
      // @ts-expect-error
      return (nodes.find((n: any) => n.id === 1).images || []).length;
    })).toBe(1);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      const note = nodes.find((n: any) => n.id === 1).note;
      // @ts-expect-error
      renderPreviewBody();
      const body = document.getElementById('preview-body')!;
      return { noteHtml: note, figures: body.querySelectorAll('.pv-node-image-figure img').length, noteCard: !!body.querySelector('.pv-inline-label-note') };
    });
    expect(result.noteHtml).not.toContain('<img');
    expect(result.figures).toBe(1);
    expect(result.noteCard).toBe(false);
  });
});
