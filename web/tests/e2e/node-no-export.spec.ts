import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: "exclude certain nodes from export". Right-click → Leave out of export: the row
// and everything under it are skipped by the PDF and OPML exports; the editor shows one quiet dot.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay'); if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    const n = (id: number, depth: number, text: string, parentId: number | null) => ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {} });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Flexible Night Delivery', null), n(2, 1, 'Delivery window', 1), n(3, 1, 'Internal cost estimate', 1), n(4, 2, 'Two forty per stop', 3), n(5, 1, 'Customer notified', 1), n(6, 0, 'Tailored Delivery', null)].map(normalizeNode);
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 7;
    // @ts-expect-error
    render();
  });
});

async function toggleFromMenu(page: import('@playwright/test').Page, id: number, label: string) {
  await page.locator(`.node-row[data-id="${id}"]`).click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel [data-flyout="row"]').hover();
  const item = page.locator('#context-menu :is(#context-more-panel, .sb-context-submenu) [data-action="no-export"]');
  await expect(item).toContainText(label);
  await item.click();
}

test('right-click → Leave out of export marks the row with a dot; clicking the dot includes it again', async ({ page }) => {
  await toggleFromMenu(page, 3, 'Leave out of export');
  const dot = page.locator('.node-row[data-id="3"] .node-noexport-dot');
  await expect(dot).toHaveCount(1);
  await expect(page.locator('.node-noexport-dot')).toHaveCount(1); // children don't repeat it
  // The flag survives a save/load round trip.
  expect(await page.evaluate(() => (normalizeNode as (n: object) => { noExport?: boolean })(JSON.parse(JSON.stringify(nodes[2]))).noExport)).toBe(true);
  // Undo brings it back in.
  await page.keyboard.press('Control+z');
  await expect(dot).toHaveCount(0);
  await toggleFromMenu(page, 3, 'Leave out of export');
  await toggleFromMenu(page, 3, 'Include in export');
  await expect(dot).toHaveCount(0);
  await toggleFromMenu(page, 3, 'Leave out of export');
  await dot.click();
  await expect(dot).toHaveCount(0);
});

test('the PDF and the OPML export skip the row and everything under it', async ({ page }) => {
  await toggleFromMenu(page, 3, 'Leave out of export');
  await page.evaluate(() => {
    // @ts-expect-error
    _applyNodeContentExportState(); previewActive = true; renderPreviewBody();
    document.getElementById('preview-overlay')?.classList.add('open');
  });
  const body = page.locator('#preview-body');
  await expect(body).toContainText('Delivery window');
  await expect(body).toContainText('Customer notified');
  await expect(body).not.toContainText('Internal cost estimate');
  await expect(body).not.toContainText('Two forty per stop');
  // The file never mentions them; a toast on export says how many were skipped.
  await page.evaluate(() => noExportToast(nodes));
  await expect(page.locator('#toast')).toContainText('2 rows left out of the export');

  const opml = await page.evaluate(() => serializeOpml(withoutNoExportNodes(getScopedNodes(true))));
  expect(opml).toContain('Delivery window');
  expect(opml).toContain('Tailored Delivery');
  expect(opml).not.toContain('Internal cost estimate');
  expect(opml).not.toContain('Two forty per stop');
});

test('threads and Q&A on left-out rows and their sub-rows stay out of the PDF lists too', async ({ page }) => {
  // Owner, 2026-10-20: "objects are leaking into the export".
  const text = await page.evaluate(() => {
    // @ts-expect-error
    nodes[2].noExport = true;
    // @ts-expect-error
    remarks = [{ id: 'a', anchorNodeId: 3, text: 'Cost thread', person: 'A', createdAt: 1 }, { id: 'b', anchorNodeId: 4, text: 'Sub-row question', type: 'question', createdAt: 2 }, { id: 'c', anchorNodeId: 5, text: 'Kept thread', createdAt: 3 }];
    // @ts-expect-error
    qaItems = [{ id: 'qa1', question: 'Sub-row Q&A', sourceNodeId: 4 }];
    // @ts-expect-error
    render(); previewCollapsedIds = new Set(); const restore = _applyNodeContentExportState(); renderPreviewBody(); restore();
    return document.getElementById('preview-body')?.innerText || '';
  });
  expect(text).toContain('Kept thread');
  expect(text).not.toContain('Cost thread');
  expect(text).not.toContain('Sub-row question');
  expect(text).not.toContain('Sub-row Q&A');
});
