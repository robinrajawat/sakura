import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Both previews show only the item's own name (no row text), and their buttons sit in the same
// places: Close, Delete, Download and Copy line up exactly (owner, 2026-10-23).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#acd"/></svg>');

for (const width of [1440, 800]) {
  test(`preview headers: name only, buttons aligned (${width}px)`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
    await page.setViewportSize({ width, height: 700 });
    await page.goto('file://' + indexPath);
    await page.waitForFunction('typeof render === "function"');
    await page.evaluate((svg) => (window as any).eval(`ensureDocumentForEditing();
      nodes = [normalizeNode({ id: 1, depth: 0, text: 'Row words here', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, images: [{ id: 'i1', src: ${JSON.stringify(svg)}, caption: 'Label' }] })];
      rebuildParentIds();
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Flow', xml: '<mxGraphModel/>', previewSvg: ${JSON.stringify(svg)}, pageSvgs: [], pageCount: 1, note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      render(); openDiagramViewer('d1'); 0`), SVG);
    const rights = (sel: string) => page.evaluate((sel) => [...document.querySelectorAll(sel + ' .pv-head > *')].slice(-4).map((e) => Math.round(e.getBoundingClientRect().right)), sel);
    await expect(page.locator('#diagram-viewer .pv-head')).not.toContainText('Row words here');
    const dv = await rights('#diagram-viewer');
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as any).eval(`openNodeImageViewer(1, 'i1'); 0`));
    await expect(page.locator('#node-image-viewer .pv-head')).not.toContainText('Row words here');
    expect(await rights('#node-image-viewer')).toEqual(dv);
  });
}
