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

  test('an inline image sitting mid-sentence stays right where it is, not extracted', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, `<p>Look at this <img src="${img1x1}" alt="inline"> icon right here.</p>`);

    const result = await page.evaluate(() => {
      const body = document.getElementById('preview-body')!;
      const noteBody = body.querySelector('.pv-inline-note-body');
      return {
        imgInsideBox: !!noteBody?.querySelector('img'),
        figureCount: body.querySelectorAll('.pv-diagram-figure').length,
      };
    });
    expect(result.imgInsideBox).toBe(true);
    expect(result.figureCount).toBe(0);
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

  test('a plain (not-yet-charted) table pulled into its own figure can still be right-clicked to feature it as a chart', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, '<p>Some text.</p><table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>');

    await page.locator('.pv-table-figure').click({ button: 'right' });
    await expect(page.locator('#chart-ctx-menu.open')).toBeVisible();
    await page.locator('#chart-ctx-menu .chart-type-item[data-chart-type="bar"]').click();

    const note = await page.evaluate(() => {
      // @ts-expect-error
      return nodes.find((n: any) => n.id === 2).note;
    });
    expect(note).toContain('data-feature-chart="1"');
  });
});
