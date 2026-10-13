import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A tag/marker filter hides non-matching rows, but a row's inline blocks (remarks, Q&A, note,
// tables, images, diagrams) are separate siblings after it. They used to stay visible, so a
// hidden row's remark showed up under the previous, matching row as if it belonged to it.
test.describe('Filtering hides a filtered-out row\'s inline objects too', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); });
    await page.goto('file://' + indexPath);
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display = 'none'; });
    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Marked child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: ['x'], styles: {}, marker: 'issue' },
        { id: 3, depth: 1, text: 'Last child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: ['<table><tr><td>Last table cell</td></tr></table>'] },
      ];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
      // @ts-expect-error
      remarks = [
        { id: 'ra', anchorNodeId: 2, person: 'A', date: '2026-10-01', text: 'Remark on marked row', createdAt: 1 },
        { id: 'rb', anchorNodeId: 3, person: 'B', date: '2026-10-02', text: 'Remark on last row', createdAt: 2 },
      ];
      // @ts-expect-error
      inlineExpandRemarksNodeIds = new Set([2, 3]);
      // @ts-expect-error
      render();
    });
  });

  const visibleRemarks = (page: import('@playwright/test').Page) => page.evaluate(() =>
    [...document.querySelectorAll('.node-remark-text-inline')]
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => (el as HTMLElement).dataset.remarkId));

  test('marker filter', async ({ page }) => {
    expect(await visibleRemarks(page)).toEqual(['ra', 'rb']);
    // @ts-expect-error
    await page.evaluate(() => setMarkerFilter('issue'));
    expect(await visibleRemarks(page)).toEqual(['ra']);
    await expect(page.getByText('Last table cell')).toBeHidden();
    // @ts-expect-error
    await page.evaluate(() => setMarkerFilter(null));
    expect(await visibleRemarks(page)).toEqual(['ra', 'rb']);
    await expect(page.getByText('Last table cell')).toBeVisible();
  });

  test('tag filter', async ({ page }) => {
    // @ts-expect-error
    await page.evaluate(() => setTagFilter('x'));
    expect(await visibleRemarks(page)).toEqual(['ra']);
  });
});
