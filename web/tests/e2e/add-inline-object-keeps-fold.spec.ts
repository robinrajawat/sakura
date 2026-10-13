import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Inline objects show directly under their row even while its branch is folded, so adding one
// (question, remark, table) must not unfold the row's children (owner request).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seedFolded(page: Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Folded parent'), n(2, 1, 'Hidden child')]; rebuildParentIds(); nextId = 3;
    remarks = []; qaItems = []; collapsedIds = new Set([1]); editingId = null; render();
  `);
}

const childVisible = (page: Page) => page.evaluate('!!document.querySelector(\'.node-row[data-id="2"]\')');

for (const action of ['qa', 'remark'] as const) {
  test(`adding a ${action === 'qa' ? 'question' : 'remark'} keeps the row folded`, async ({ page }) => {
    await seedFolded(page);
    expect(await childVisible(page)).toBe(false);
    await page.evaluate(`runQuickAction('${action}', 1)`);
    await expect(page.locator(action === 'qa' ? '.node-qa-line' : '.node-remark-line')).toHaveCount(1);
    expect(await page.evaluate('collapsedIds.has(1)')).toBe(true);
    expect(await childVisible(page)).toBe(false);
  });
}

test('adding a table keeps the row folded and shows the table', async ({ page }) => {
  await seedFolded(page);
  await page.evaluate('collapsedTableNodeIds.add(1); insertNodeTable(1, 2, 2)');
  await expect(page.locator('.node-table-line')).toHaveCount(1);
  expect(await page.evaluate('collapsedIds.has(1)')).toBe(true);
  expect(await childVisible(page)).toBe(false);
});
