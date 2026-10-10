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

const chartNote = '<table data-feature-chart="1"><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr><tr><td>B</td><td>20</td></tr></table>';

function setUpDoc(page: import('@playwright/test').Page, note: string) {
  return page.evaluate((note) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Parent row', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} },
      { id: 2, depth: 1, text: 'A row with a chart note', parentId: 1, isCheckbox: false, checked: false, note, noteTitle: '', tags: [], styles: {} },
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

// A note's own "Feature as chart" table used to render as a plain backing table in Preview/
// Presenter/PDF -- renderNoteDisplayHtml only ever swapped it for the live editor's own inline
// display, not the separate rendering renderPreviewBody does. noteChartDisplayHtml closes that
// gap, and openChartCtxMenu's right-click type-switcher (already used for Pad's own charted
// tables) is wired to it via noteTableByIndex/persistNoteTableChange, since a note's table has no
// permanent live DOM element the way Pad's "Feature under node" tables do.
test.describe("A note's chart-featured table renders as a chart in Preview and its right-click menu can switch types", () => {
  test('renders as a chart figure, not the plain backing table', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await setUpDoc(page, chartNote);

    const result = await page.evaluate(() => {
      const doc = document.getElementById('preview-body')!;
      const fig = doc.querySelector('.pv-table-chart-figure[data-note-chart-node-id]');
      return {
        hasFig: !!fig,
        hasSvg: !!fig?.querySelector('svg'),
        hasPlainTable: !!doc.querySelector('.pv-inline-note-body table'),
        nodeId: fig?.getAttribute('data-note-chart-node-id'),
        tableIdx: fig?.getAttribute('data-note-chart-table-idx'),
      };
    });
    expect(result.hasFig).toBe(true);
    expect(result.hasSvg).toBe(true);
    expect(result.hasPlainTable).toBe(false);
    expect(result.nodeId).toBe('2');
    expect(result.tableIdx).toBe('0');
  });

  // The right-click type-switcher this used to test (openChartCtxMenu/#chart-ctx-menu) was
  // Preview-overlay-only chrome -- removed along with the rest of the interactive Preview
  // overlay. #preview-body is now a headless export container, permanently display:none on
  // screen outside of exportPreviewAsPdf's own print pass, so there is nothing left to
  // right-click here. Switching a table's chart type in the live, editable document is still
  // fully supported via the node-row/note right-click menu's "Edit card/chart" item (see
  // enterScopedTableEdit and buildChartFeatureItems), which is covered elsewhere
  // (tests/e2e/inline-note-rich-text.spec.ts).
});
