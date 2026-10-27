import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white" stroke="#333"/><rect x="60" y="200" width="160" height="70" rx="8" fill="#eef" stroke="#557"/><text x="85" y="240" font-family="sans-serif" font-size="16">Order placed</text><rect x="320" y="200" width="160" height="70" rx="8" fill="#eef" stroke="#557"/><text x="352" y="240" font-family="sans-serif" font-size="16">Night pick</text><rect x="580" y="200" width="160" height="70" rx="8" fill="#eef" stroke="#557"/><text x="612" y="240" font-family="sans-serif" font-size="16">Delivered</text><path d="M220 235h100M480 235h100" stroke="#557" stroke-width="2"/></svg>');

// Owner, 2026-10-27: the "note to yourself" moved from the draw.io editor's header into the
// diagram preview, so notes can be recorded while the diagram is being shown.
test.describe('Diagram preview notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
    await page.goto('file://' + indexPath);
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display = 'none'; });
    await page.evaluate((svg) => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Flexible night delivery', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      diagrams = [
        { id: 'd1', anchorNodeId: 1, title: 'Night delivery', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true },
        { id: 'd2', anchorNodeId: 1, title: 'Returns', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, note: 'Old reminder', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true },
      ];
      // @ts-expect-error
      render();
    }, SVG);
  });

  test('the editor header has no note field any more', async ({ page }) => {
    await expect(page.locator('#diagram-editor-note-input')).toHaveCount(0);
  });

  test('Notes opens a pane in the preview, saves as you type, follows ← / →, and N toggles it', async ({ page }) => {
    // @ts-expect-error
    await page.evaluate(() => openDiagramViewer('d1'));
    const viewer = page.locator('#diagram-viewer');
    await expect(viewer).toHaveClass(/open/);
    const pane = viewer.locator('.dv-notes');
    const toggle = viewer.locator('.dv-notes-toggle');
    await expect(pane).toBeHidden();
    await expect(toggle).not.toHaveClass(/has-notes/);

    await toggle.click();
    await expect(pane).toBeVisible();
    const input = viewer.locator('.dv-notes-input');
    await expect(input).toBeFocused();
    await input.pressSequentially('Ask Chandana about the 2am cut-off');
    await input.press('Enter');
    await input.pressSequentially('+ fewer drivers on Sunday');
    // Typing keys like f, 0, + and Enter stays in the notes (no zoom, no close).
    await expect(viewer).toHaveClass(/open/);
    // @ts-expect-error
    expect(await page.evaluate(() => findDiagram('d1').note)).toBe('Ask Chandana about the 2am cut-off\n+ fewer drivers on Sunday');

    await page.screenshot({ path: test.info().outputPath('notes-open.png') });

    // Esc leaves the field first; the preview stays open.
    await input.press('Escape');
    await expect(viewer).toHaveClass(/open/);
    await expect(input).not.toBeFocused();

    // → shows the next diagram's own notes; the pane stays open.
    await page.keyboard.press('ArrowRight');
    await expect(viewer.locator('.dv-title')).toHaveValue('Returns');
    await expect(input).toHaveValue('Old reminder');
    await expect(pane).toBeVisible();

    // N hides the pane; the button marks that this diagram has notes.
    await page.keyboard.press('n');
    await expect(pane).toBeHidden();
    await expect(toggle).toHaveClass(/has-notes/);

    await page.keyboard.press('Escape');
    await expect(viewer).not.toHaveClass(/open/);
  });
});
