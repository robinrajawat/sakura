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

// "Laser pointer" (setAppLaser) used to be reachable only by right-clicking plain text inside an
// already-open, empty-of-figures note -- a narrow, easy-to-miss target buried deep in a different
// menu's own fallback branch. It's a view-wide presentation toggle, the same one Preview/Presenter's
// own right-click already offers, so it now also lives in the ordinary per-row context menu's
// "More" panel -- reachable from any node, not just from inside a note.
test.describe('Laser pointer is reachable from the ordinary per-row right-click menu', () => {
  test('"Laser pointer" appears in the row context menu\'s More panel and toggles app-laser-active on click', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      render();
    });

    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    const laserBtn = page.locator('#context-more-panel [data-action="laser"]');
    await expect(laserBtn).toBeVisible();
    await expect(laserBtn).toContainText('Laser pointer');

    await laserBtn.click();
    const laserOn = await page.evaluate(() => document.body.classList.contains('app-laser-active'));
    expect(laserOn).toBe(true);
  });
});

// node.tables objects reuse .pv-diagram-figure/.pv-table-figure for their own styling in the live
// outline editor, not just in a static Preview/PDF export -- but that export deliberately stretches
// a figure to fill its row (width:100%, no table-layout), which only makes sense for a page that's
// never resized again. In the live, editable outline, a table's own column widths (user-adjustable
// via the resize handles) should be what determines its rendered width, like a real spreadsheet
// column -- not a fixed export rule silently overriding them.
test.describe('A table object renders at its own real size in the outline editor, not stretched to fill the row', () => {
  test('a table with narrow explicit column widths renders narrow, not stretched to the row\'s full width', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate(() => {
      const narrowTable = '<table><colgroup><col style="width:60px"><col style="width:60px"></colgroup><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tables: [narrowTable], tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      render();
    });

    const widths = await page.evaluate(() => {
      const table = document.querySelector('.node-table-line table') as HTMLElement;
      const wrap = document.querySelector('.node-table-line-wrap') as HTMLElement;
      return { tableWidth: table.getBoundingClientRect().width, wrapWidth: wrap.getBoundingClientRect().width };
    });
    // The two 60px columns (120px total, plus borders) should render far narrower than the
    // wrapping block's own available width, not stretch out to fill it.
    expect(widths.tableWidth).toBeLessThan(200);
    expect(widths.tableWidth).toBeLessThan(widths.wrapWidth * 0.6);
  });
});

// A note's own standalone picture reused Preview/PDF's own "stretch the figure to fill the row"
// figure styling in the live outline editor too -- fine for a static export, wrong for the editor,
// where even a tiny originally-inserted image was being pushed out to the full editor width.
test.describe('A note\'s standalone picture renders at its natural size in the outline editor, not stretched full-width', () => {
  test('the image figure does not flex-grow to fill its row', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    const img1x1 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';
    await page.evaluate((src) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: `<p><img src="${src}" alt="x"></p>`, tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error -- the note only renders inline at all when opted into inlineExpandNoteNodeIds (alwaysExpandInlineEnabled defaults closed)
      inlineExpandNoteNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, img1x1);

    const flexGrow = await page.evaluate(() => {
      const fig = document.querySelector('.node-note-image-figure') as HTMLElement;
      return fig ? getComputedStyle(fig).flexGrow : null;
    });
    expect(flexGrow).toBe('0');
  });
});

// applyAccentColor (the normal theme path) sets --accent as an inline document.body.style property,
// not a stylesheet rule -- exportPreviewAsPdf's own cleanup used to removeProperty('--accent')
// unconditionally as part of undoing its print-only overrides, which doesn't "restore the prior
// value", it deletes the property outright. That wiped the live accent along with the print
// override, falling back to the stylesheet's own default color until a page refresh re-ran
// applyAccentColor(). cleanup() now re-applies the real accent instead of just removing it.
test.describe('Exporting to PDF does not permanently reset the accent color', () => {
  test('the accent color is restored (not left at the stylesheet default) once the print pass ends', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const distinctiveAccent = '#123456';
    await page.evaluate((color) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'A', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      accentPreset = 'custom'; accentCustomColor = color;
      // @ts-expect-error
      applyAccentColor();
      // @ts-expect-error
      previewActive = true; renderPreviewBody();
      document.getElementById('preview-overlay')?.classList.add('open');
    }, distinctiveAccent);

    const before = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
    expect(before).toBe(distinctiveAccent);

    await page.evaluate(() => {
      // @ts-expect-error
      exportPreviewAsPdf(() => {});
    });
    // exportPreviewAsPdf's own cleanup() listens for 'afterprint' -- headless Chromium's
    // window.print() doesn't drive a real print lifecycle, so the event is dispatched directly
    // here to deterministically trigger the same cleanup a real print's end would, rather than
    // relying on the 15s fallback timer.
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

    const after = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim());
    expect(after).toBe(distinctiveAccent);
  });
});
