import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Column type › (cell menu while editing): Automatic, Text, Number, Date, Status or a currency.
// Stored as data-type / data-currency on the column's cells. Currency values are written as
// currency; Status columns show pills and a status picker; Date columns a date picker.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const T = '<table><thead><tr><th>Task</th><th>Phase</th><th>Cost</th><th>When</th><th>Status</th></tr></thead><tbody>'
  + '<tr><td>Labels</td><td>Open</td><td>1234.5</td><td>Oct 1, 2026</td><td>Done</td></tr>'
  + '<tr><td>Carrier</td><td>Done</td><td>12</td><td></td><td>Open</td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'coltypes';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], tags: [], styles: {} },
          { id: 2, depth: 0, text: 'Other', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} }],
        nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Types', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Types', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, T);
});

async function load(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await expect(page.locator('.node-table-line')).toHaveCount(1);
  return errors;
}
const fig = (page: Page) => page.locator('.node-table-line');
// @ts-expect-error -- bare global from index.html
const stored = (page: Page) => page.evaluate(() => nodes[0].tables[0] as string);
async function setType(page: Page, f: Locator, cell: string, label: string) {
  await f.locator('td,th', { hasText: cell }).first().click();
  await expect(f).toHaveClass(/editing/);
  await f.locator('td,th', { hasText: cell }).first().click({ button: 'right' });
  const menu = page.locator('.sb-context-menu:not(.sb-context-submenu)');
  await menu.locator(':scope > .sb-context-item', { hasText: /^Column type$/ }).hover();
  await page.locator('.sb-context-submenu .sb-context-item', { hasText: new RegExp('^' + label.replace(/[$.·]/g, (c) => '\\' + c) + '$') }).click();
  await expect(page.locator('.sb-context-menu')).toHaveCount(0);
}
const leave = async (page: Page) => { await page.keyboard.press('Escape'); await expect(fig(page)).not.toHaveClass(/editing/); };

test('Currency: values are written as currency, right-aligned, and new entries too', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  await setType(page, f, '1234.5', 'EUR · Euro');
  await expect(f.locator('tbody td:nth-child(3)')).toHaveText(['€1,234.50', '€12.00']);
  // Typing a plain number and leaving the cell formats it.
  const c = f.locator('tbody tr:nth-child(2) td:nth-child(3)');
  await c.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('99');
  await page.keyboard.press('Tab');
  await expect(c).toHaveText('€99.00');
  await leave(page);
  const html = await stored(page);
  expect(html).toContain('data-type="currency"');
  expect(html).toContain('data-currency="EUR"');
  await expect(f.locator('tbody td:nth-child(3)').first()).toHaveAttribute('data-auto-align', 'right');
  // The menu shows the current type.
  await setType(page, f, '€99.00', 'USD · US Dollar');
  await expect(f.locator('tbody td:nth-child(3)')).toHaveText(['$1,234.50', '$99.00']);
  expect(errors).toEqual([]);
});

test('Status: pills whatever the header, and a picker while editing', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  await setType(page, f, 'Phase', 'Status');
  // Picker on a body cell of the column.
  const cell = f.locator('tbody tr:nth-child(2) td:nth-child(2)');
  await cell.click();
  const picker = f.locator('.tbl-cell-picker');
  await expect(picker.locator('button')).toHaveText(['Open', 'In progress', 'Blocked', 'Done']);
  await expect(picker.locator('button.current')).toHaveText('Done');
  await picker.getByText('Blocked', { exact: true }).click();
  await expect(cell).toHaveText('Blocked');
  await expect(picker).toHaveCount(0);
  await leave(page);
  const html = await stored(page);
  expect(html).not.toContain('tbl-cell-picker');
  expect(html).toContain('data-type="status"');
  await expect(f.locator('tbody td:nth-child(2) .tbl-status-pill')).toHaveText(['Open', 'Blocked']);
  // The Status board uses the typed column, not the one headed "Status".
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = nodes[0].tables[0]; return tableStatusBoardInfo(d.querySelector('table')).status; })).toBe(1);
  expect(errors).toEqual([]);
});

test('Text switches automatic status pills off', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  await expect(f.locator('tbody td:nth-child(5) .tbl-status-pill')).toHaveCount(2);
  await setType(page, f, 'Status', 'Text');
  await leave(page);
  await expect(f.locator('tbody td:nth-child(5) .tbl-status-pill')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Date: a picker writes dates in the column\'s own style', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  await setType(page, f, 'When', 'Date');
  const cell = f.locator('tbody tr:nth-child(2) td:nth-child(4)');
  await cell.click();
  const picker = f.locator('.tbl-cell-picker');
  await expect(picker.locator('input[type="date"]')).toBeVisible();
  await picker.locator('input[type="date"]').fill('2026-12-15');
  await expect(cell).toHaveText('Dec 15, 2026');
  // Today / Clear.
  await f.locator('tbody tr:nth-child(1) td:nth-child(4)').click();
  await expect(picker.locator('input[type="date"]')).toHaveValue('2026-10-01');
  await picker.getByText('Clear', { exact: true }).click();
  await expect(f.locator('tbody tr:nth-child(1) td:nth-child(4)')).toHaveText('');
  await leave(page);
  expect(await stored(page)).toContain('Dec 15, 2026');
  expect(errors).toEqual([]);
});

test('More currencies… searches every currency, and the pick moves to the top of the menu', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  await setType(page, f, '1234.5', 'More currencies…');
  const picker = f.locator('.tbl-currency-picker');
  await expect(picker.locator('input')).toBeFocused();
  await page.keyboard.type('danish');
  await expect(picker.locator('.tbl-currency-row')).toHaveCount(1);
  await expect(picker.locator('.tbl-currency-row b')).toHaveText('DKK');
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);
  // Still editing, the column now in DKK, and the values still read as numbers (right-aligned).
  await expect(f).toHaveClass(/editing/);
  await expect(f.locator('tbody td:nth-child(3)')).toHaveText([/^DKK\s1,234\.50$/, /^DKK\s12\.00$/]);
  await leave(page);
  expect(await stored(page)).toContain('data-currency="DKK"');
  await expect(f.locator('tbody td:nth-child(3)').first()).toHaveAttribute('data-auto-align', 'right');
  // DKK now leads the menu's currencies, with a check mark.
  await f.locator('td', { hasText: 'Labels' }).click();
  await f.locator('tbody td:nth-child(3)').first().click({ button: 'right' });
  await page.locator('.sb-context-menu:not(.sb-context-submenu) > .sb-context-item', { hasText: /^Column type$/ }).hover();
  const items = page.locator('.sb-context-submenu .sb-context-item');
  await expect(items.filter({ hasText: /·/ }).first()).toHaveText('DKK · Danish Krone');
  await expect(items.filter({ hasText: 'DKK · Danish Krone' }).locator('svg')).toHaveCount(1);
  // Escape closes the search without changing anything.
  await items.filter({ hasText: 'More currencies…' }).click();
  await expect(picker.locator('.tbl-currency-row.current b')).toHaveText('DKK');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(f).toHaveClass(/editing/);
  expect(errors).toEqual([]);
});

test('Person: names show as chips, automatically under an Owner header, with a picker while editing', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page);
  // "Task" isn't a people header; set it to Person.
  await setType(page, f, 'Labels', 'Person');
  await leave(page);
  await expect(f.locator('tbody td:nth-child(1) .tbl-person')).toHaveText(['Labels', 'Carrier']);
  // Same name, same colour.
  // @ts-expect-error -- bare globals from index.html
  const same = await page.evaluate(() => personInlineHtml('Ana') === personInlineHtml('Ana') && personInlineHtml('Ana, Raj & Mo').split('tbl-person').length - 1 === 3);
  expect(same).toBe(true);
  // Picker offers the column's people; a click fills the cell.
  const cell = f.locator('tbody tr:nth-child(2) td:nth-child(1)');
  await cell.click();
  const picker = f.locator('.tbl-cell-picker');
  await expect(picker.locator('.tbl-picker-person')).toHaveCount(2);
  await expect(picker.locator('.tbl-picker-person.current .tbl-person-av')).toHaveText('C');
  await picker.locator('.tbl-picker-person', { hasText: 'Labels' }).click();
  await expect(cell).toHaveText('Labels');
  await leave(page);
  expect(await stored(page)).toContain('data-type="person"');
  expect(await stored(page)).not.toContain('tbl-person');
  expect(errors).toEqual([]);
});

test('Person chips keep the cell text exactly, separators included', async ({ page }) => {
  await load(page);
  // @ts-expect-error -- bare global from index.html
  const r = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = personInlineHtml('Ana, Raj & @Mo'); return { text: d.textContent, chips: [...d.querySelectorAll('.tbl-person')].map((e) => e.textContent) }; });
  expect(r).toEqual({ text: 'Ana, Raj & @Mo', chips: ['Ana', 'Raj', '@Mo'] });
});
