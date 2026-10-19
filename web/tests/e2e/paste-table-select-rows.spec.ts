import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Pasting a table and selecting rows shouldn't need the hidden "Esc first" step (owner request
// 2026-10-19): a table pasted while typing in a row attaches to that row, the bullet selects its
// row, and Shift+Down at the end of the text carries on into row selection.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => {
    const w = window as any;
    const n = (id: number, t: string) => ({ id, depth: 0, text: t, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    w.eval('ensureDocumentForEditing();');
    w.eval(`nodes = [${JSON.stringify(n(1, 'Alpha'))}, ${JSON.stringify(n(2, 'Beta'))}, ${JSON.stringify(n(3, 'Gamma'))}]; rebuildParentIds(); nextId = 4; render();`);
  });
});

const row = (page: Page, id: number) => page.locator(`.node-row[data-id="${id}"]`);

async function pasteHtml(page: Page, html: string, text: string) {
  await page.evaluate(([html, text]) => {
    const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', text);
    const target = document.activeElement || document.body;
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [html, text]);
}

const TABLE = '<table><tr><td>Item</td><td>Owner</td></tr><tr><td>A</td><td>Ana</td></tr></table>';

test('a table pasted while editing a row becomes a table on that row, not new rows', async ({ page }) => {
  await row(page, 2).locator('.node-label').click();
  await expect(page.locator('.node-row[data-id="2"] .node-input')).toBeVisible();
  await pasteHtml(page, TABLE, 'Item\tOwner\nA\tAna');
  expect(await page.evaluate('nodes.length')).toBe(3);
  expect(await page.evaluate('nodes[1].tables.length')).toBe(1);
  expect(await page.evaluate('nodes[1].text')).toBe('Beta');
  await expect(page.locator('.node-table-line table')).toHaveCount(1);
});

test('clicking the bullet selects the row; Shift-click on another bullet extends it', async ({ page }) => {
  await row(page, 1).locator('.node-dot').click();
  expect(await page.evaluate('[selectedId, editingId]')).toEqual([1, null]);
  await row(page, 3).locator('.node-dot').click({ modifiers: ['Shift'] });
  expect(await page.evaluate('multiSelectedIds')).toEqual([1, 2, 3]);
  await expect(page.locator('#row-sel-pill')).toContainText('3 rows selected');
  await page.click('#row-sel-pill .rsp-clear');
  await expect(page.locator('#row-sel-pill')).toBeHidden();
  // A single selected row takes a pasted table too.
  await row(page, 2).locator('.node-dot').click();
  await pasteHtml(page, TABLE, 'Item\tOwner');
  expect(await page.evaluate('nodes[1].tables.length')).toBe(1);
});

test('Shift+Down at the end of the text leaves editing and selects rows', async ({ page }) => {
  await row(page, 1).locator('.node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate('editingId')).toBeNull();
  expect(await page.evaluate('multiSelectedIds')).toEqual([1, 2]);
  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate('multiSelectedIds')).toEqual([1, 2, 3]);
});
