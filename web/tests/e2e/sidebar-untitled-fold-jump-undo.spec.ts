import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: (1) with no document open the sidebar listed "No documents" while the editor
// showed "Untitled"; (2) an accent-coloured folded count should take you to what is open inside;
// (3) Expand all / Collapse all should be undoable.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => { const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none'; });
});

const seed = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const n = (id: number, depth: number, text: string, parentId: number | null, x: object = {}) => ({ id, depth, text, parentId, styles: {}, ...x });
  // @ts-expect-error -- bare globals from index.html
  nodes = [n(1, 0, 'Scope', null), n(2, 1, 'Plain', 1), n(3, 1, 'Asked here', 1), n(4, 0, 'Plan', null), n(5, 1, 'Step', 4)].map(normalizeNode);
  // @ts-expect-error
  remarks = [{ id: 'q1', anchorNodeId: 3, text: 'Who signs off?', type: 'question', createdAt: 1 }];
  // @ts-expect-error
  collapsedIds = new Set([1, 4]); selectedId = null; undoStack = []; redoStack = []; nextId = 6; render();
});

test('with no document open, the sidebar lists the unsaved Untitled document instead of "No documents"', async ({ page }) => {
  // @ts-expect-error
  expect(await page.evaluate(() => currentDocId)).toBeNull();
  const row = page.locator('#sb-docs-list .sdoc-unsaved');
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/active/);
  await expect(row).toContainText('Untitled');
  await expect(page.locator('#sb-docs-list .sb-empty')).toHaveCount(0);
});

test('clicking an accent-coloured folded count unfolds it and opens the first open question', async ({ page }) => {
  await seed(page);
  const badge = page.locator('.node-row[data-id="1"] .fold-badge');
  await expect(badge).toHaveClass(/fold-badge-open/);
  await badge.dispatchEvent('mousedown');
  await expect(page.locator('.node-row[data-id="3"]')).toBeVisible();
  // @ts-expect-error
  expect(await page.evaluate(() => [collapsedIds.has(1), inlineExpandRemarksNodeIds.has(3), selectedId])).toEqual([false, true, 3]);
  // A plain count just unfolds.
  await page.locator('.node-row[data-id="4"] .fold-badge').dispatchEvent('mousedown');
  await expect(page.locator('.node-row[data-id="5"]')).toBeVisible();
});

test('Expand all and Collapse all can be undone and redone', async ({ page }) => {
  await seed(page);
  // @ts-expect-error
  const folds = () => page.evaluate(() => [...collapsedIds].sort());
  // @ts-expect-error
  await page.evaluate(() => expandAll());
  expect(await folds()).toEqual([]);
  // @ts-expect-error
  await page.evaluate(() => undo());
  expect(await folds()).toEqual([1, 4]);
  // @ts-expect-error
  await page.evaluate(() => redo());
  expect(await folds()).toEqual([]);
  // @ts-expect-error
  await page.evaluate(() => { collapsedIds = new Set([4]); collapseAll(); });
  expect(await folds()).toEqual([1, 4]);
  // @ts-expect-error
  await page.evaluate(() => undo());
  expect(await folds()).toEqual([4]);
});

test('clicking a status badge opens its menu without scrolling the page', async ({ page }) => {
  await page.evaluate(() => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, depth: 0, text: 'Row ' + (i + 1), parentId: null, styles: {} }));
    // @ts-expect-error -- bare globals from index.html
    nodes = rows.map(normalizeNode); nodes[20].marker = 'confirmed';
    // @ts-expect-error
    remarks = [{ id: 'a1', anchorNodeId: 21, text: 'Agreed', status: 'resolved', createdAt: 1 }];
    // @ts-expect-error
    inlineExpandRemarksNodeIds = new Set([21]); collapsedIds = new Set(); selectedId = null; render();
  });
  const pane = page.locator('#editor-pane');
  await page.locator('#inline-remark-text-a1').scrollIntoViewIfNeeded();
  await pane.evaluate((p) => { p.scrollTop += 40; });
  const before = await pane.evaluate((p) => p.scrollTop);
  await page.locator('.node-row[data-id="21"] .node-marker-badge').click();
  await expect(page.locator('.sb-context-menu')).toBeVisible();
  await page.waitForTimeout(400);
  expect(await pane.evaluate((p) => p.scrollTop)).toBe(before);
});
