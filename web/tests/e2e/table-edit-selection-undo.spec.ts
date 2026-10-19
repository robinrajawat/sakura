import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Table editing (owner request 2026-10-19): undo/redo inside the editing session, row / column grips
// with their own menu, and a rectangular cell selection that Delete clears and Ctrl/Cmd+C copies.

const TABLE = '<table><tr><th>Item</th><th>Owner</th><th>Due</th></tr><tr><td>A</td><td>Ana</td><td>1</td></tr><tr><td>B</td><td>Raj</td><td>2</td></tr><tr><td>C</td><td>Mo</td><td>3</td></tr></table>';

async function seed(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate((t) => {
    (window as any).eval(`ensureDocumentForEditing(); nodes=[{id:1,depth:0,text:'Plan',parentId:null,isCheckbox:false,checked:false,note:'',images:[],tags:[],styles:{},tables:[${JSON.stringify(t)}]}]; rebuildParentIds(); nextId=2; undoStack=[]; render();`);
  }, TABLE);
  await page.locator('.node-table-line td', { hasText: 'Raj' }).click();
  await expect(page.locator('.node-table-line.editing')).toHaveCount(1);
}

const saved = (page: Page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = (window as any).eval('nodes[0].tables[0]') || '';
  return [...d.querySelectorAll('tr')].map((r) => [...(r as HTMLTableRowElement).cells].map((c) => c.textContent).join(',')).join(' | ');
});

test('a row grip deletes its row, and Ctrl+Z / Ctrl+Shift+Z undo and redo it without leaving the table', async ({ page }) => {
  await seed(page);
  await page.locator('.tbl-grip-row[data-r="2"]').click({ force: true });
  await page.locator('.sb-context-menu').getByText('Delete row', { exact: true }).click();
  expect(await saved(page)).toBe('Item,Owner,Due | A,Ana,1 | C,Mo,3');
  await page.keyboard.press('Control+z');
  expect(await saved(page)).toBe('Item,Owner,Due | A,Ana,1 | B,Raj,2 | C,Mo,3');
  await expect(page.locator('.node-table-line.editing')).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  expect(await saved(page)).toBe('Item,Owner,Due | A,Ana,1 | C,Mo,3');
});

test('a column grip deletes its column; typing is undone in one step', async ({ page }) => {
  await seed(page);
  await page.locator('.tbl-grip-col[data-c="2"]').click({ force: true });
  await page.locator('.sb-context-menu').getByText('Delete column', { exact: true }).click();
  expect(await saved(page)).toBe('Item,Owner | A,Ana | B,Raj | C,Mo');
  await page.locator('.node-table-line td', { hasText: 'Mo' }).click();
  await page.keyboard.type('ritz');
  expect(await saved(page)).toContain('C,Moritz');
  await page.keyboard.press('Control+z');
  expect(await saved(page)).toBe('Item,Owner | A,Ana | B,Raj | C,Mo');
});

test('dragging across cells selects a range: Delete clears it, the menu deletes its rows, nothing extra is saved', async ({ page }) => {
  await seed(page);
  const from = (await page.locator('.node-table-line td', { hasText: 'Ana' }).boundingBox())!;
  const to = (await page.locator('.node-table-line td', { hasText: 'Mo' }).boundingBox())!;
  await page.mouse.move(from.x + 5, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.tbl-sel')).toHaveCount(3);
  await page.keyboard.press('Delete');
  expect(await saved(page)).toBe('Item,Owner,Due | A,,1 | B,,2 | C,,3');
  await page.keyboard.press('Control+z');
  // Shift+click makes a range too; right-click it to delete the rows it covers.
  await page.locator('.node-table-line td', { hasText: 'A' }).first().click();
  await page.locator('.node-table-line td', { hasText: 'Raj' }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.tbl-sel')).toHaveCount(4);
  await page.locator('.node-table-line td', { hasText: 'Raj' }).click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Delete 2 rows', { exact: true }).click();
  expect(await saved(page)).toBe('Item,Owner,Due | C,Mo,3');
  expect(await page.evaluate(() => /tbl-sel|tbl-grip/.test((window as any).eval('nodes[0].tables[0]')))).toBe(false);
});

test('Ctrl/Cmd+C copies a selected range as a spreadsheet range', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  await page.locator('.node-table-line td', { hasText: 'A' }).first().click();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.tbl-sel')).toHaveCount(4);
  await page.keyboard.press('Control+c');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('A\tAna\nB\tRaj');
});
