import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// "/" on an empty row opens the Insert list at the caret (owner, 2026-10-27); picking an item
// takes the "/" back out, typing on keeps it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
  await page.evaluate(() => {
    (window as any).eval(`nodes = [normalizeNode({ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }),
      normalizeNode({ id: 2, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })];
      rebuildParentIds(); nextId = 3; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; undoStack = []; redoStack = []; render();`);
  });
  await page.locator('.node-row[data-id="2"] .node-label').click();
}
const node2 = (page: Page) => page.evaluate(() => (window as any).eval('({ text: nodes[1].text, isCheckbox: nodes[1].isCheckbox, editing: editingId })'));
const menu = (page: Page) => page.locator('#insert-menu');

test('"/" on an empty row opens the Insert list; Enter on Note opens the note and drops the "/"', async ({ page }) => {
  await open(page);
  await page.keyboard.type('/');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator('.sb-context-active')).toContainText('Note');
  await page.keyboard.press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).eval('inlineExpandNoteNodeIds.has(2)'))).toBe(true);
  expect((await node2(page)).text).toBe('');
});

test('Date/time goes into the row in place of the "/"', async ({ page }) => {
  await open(page);
  await page.keyboard.type('/');
  await menu(page).getByText('Date/time', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await node2(page)).text).toMatch(/^\S.*\d/);
  expect((await node2(page)).text.startsWith('/')).toBe(false);
});

test('a mouse pick works too (Checkbox), and the "/" goes', async ({ page }) => {
  await open(page);
  await page.keyboard.type('/');
  await menu(page).getByText('Checkbox', { exact: true }).click();
  await expect.poll(() => node2(page)).toMatchObject({ text: '', isCheckbox: true });
});

test('typing on after "/" closes the list and keeps the text; Escape keeps the "/"', async ({ page }) => {
  await open(page);
  await page.keyboard.type('/usr');
  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await node2(page)).text).toBe('/usr');

  await page.evaluate(() => (window as any).eval(`nodes[1].text=''; editingId=null; render();`));
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.type('/');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await node2(page)).text).toBe('/x');
});

test('"/" in a row that has words is just a slash', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type('/');
  await page.waitForTimeout(50);
  await expect(menu(page)).toHaveCount(0);
});
