import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-10-27: no notes in the diagram preview or the draw.io editor ("no need to add more
// complexity"); a row's own note holds anything to say about its diagram.
test('the diagram preview and the editor have no notes field', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Night delivery', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
    // @ts-expect-error
    diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Flow', xml: '<mxGraphModel/>', previewSvg: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), pageSvgs: [], pageCount: 1, note: 'Old reminder', createdAt: 1, modifiedAt: 1, _hydrated: true }];
    // @ts-expect-error
    render();
    // @ts-expect-error
    openDiagramViewer('d1');
  });
  await expect(page.locator('#diagram-viewer')).toHaveClass(/open/);
  await expect(page.locator('#diagram-viewer .dv-notes-toggle, #diagram-viewer .dv-notes')).toHaveCount(0);
  await page.keyboard.press('n');
  await expect(page.locator('#diagram-viewer textarea')).toHaveCount(0);
  await expect(page.locator('#diagram-editor-note-input')).toHaveCount(0);
});
