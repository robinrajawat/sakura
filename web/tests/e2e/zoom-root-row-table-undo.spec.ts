import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const TABLE = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';

async function seed(page: import('@playwright/test').Page) {
  await page.goto('file://' + indexPath);
  await page.evaluate((TABLE) => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    const n = (id: number, depth: number, text: string, parentId: number | null, tables: string[] = []) =>
      ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Project', null), n(2, 1, 'Estimates', 1, [TABLE]), n(3, 2, 'Child', 2), n(4, 0, 'Other', null)];
    // @ts-expect-error
    nextId = 5; collapsedIds = new Set(); selectedId = null; editingId = null; undoStack = []; render();
  }, TABLE);
}

test('zooming into a node shows that node as the first row, with its objects, above its children', async ({ page }) => {
  await seed(page);
  // @ts-expect-error
  await page.evaluate(() => enterFocus(2));
  const ids = await page.locator('.node-row').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));
  expect(ids).toEqual(['2', '3']);
  await expect(page.locator('.node-table-line[data-node-id="2"]')).toHaveCount(1);
  // The child is indented below the zoomed node.
  const [rootLeft, childLeft] = await page.locator('.node-row').evaluateAll((els) => els.map((e) => e.querySelector('.node-text, .node-label, [class*="node-text"]')?.getBoundingClientRect().left ?? e.getBoundingClientRect().left));
  expect(childLeft).toBeGreaterThan(rootLeft);
});

test('zooming into a leaf shows its row plus the "No sub-items yet" hint', async ({ page }) => {
  await seed(page);
  // @ts-expect-error
  await page.evaluate(() => enterFocus(3));
  await expect(page.locator('.node-row')).toHaveCount(1);
  await expect(page.locator('.focus-empty-state')).toHaveCount(1);
});

test('deleting a table from its right-click menu can be undone', async ({ page }) => {
  await seed(page);
  await page.locator('.node-table-line').first().click({ button: 'right', force: true });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Delete' }).last().click();
  // @ts-expect-error
  expect(await page.evaluate(() => nodes.find((n: any) => n.id === 2).tables.length)).toBe(0);
  // @ts-expect-error
  await page.evaluate(() => undo());
  // @ts-expect-error
  expect(await page.evaluate(() => nodes.find((n: any) => n.id === 2).tables.length)).toBe(1);
  await expect(page.locator('.node-table-line')).toHaveCount(1);
});
