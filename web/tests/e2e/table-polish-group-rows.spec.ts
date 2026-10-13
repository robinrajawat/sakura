import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Plain tables display polished (horizontal rules only, quiet header, a faint dash in blank or
// quote-only cells), and "Group rows" (table menu, stored as data-group-rows) shows each run of
// repeated first-column values once, spanning its rows. Display copies only: the stored table and
// the editing grid never change.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const row = (a: string, b: string, c: string) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`;
const TABLE = '<table><thead><tr><th>Receiving Plant</th><th>Total Weight</th><th>Means</th></tr></thead><tbody>'
  + row('2001 (Centrallager Vejen)', '', 'ZTRS')
  + row('2001 (Centrallager Vejen)', '&gt;150 KG', 'ZTRS')
  + row('2001 (Centrallager Vejen)', '', '" "')
  + row('2401 (Gardermoen)', '&gt;150 KG', 'ZTRS')
  + '</tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page, table: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate((t) => {
    // @ts-expect-error -- bare globals
    nodes = [{ id: 1, depth: 0, text: 'Freight rules', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], images: [], tags: [], styles: {} }];
    // @ts-expect-error -- bare globals
    nextId = 2; collapsedIds = new Set(); editingId = null; render();
  }, table);
  return errors;
}

test('plain tables display polished; blank and quote-only cells show a dash', async ({ page }) => {
  const errors = await seed(page, TABLE);
  const t = page.locator('.node-table-line table');
  await expect(t).toHaveClass(/tbl-polished/);
  await expect(t.locator('td.tbl-empty')).toHaveCount(3);
  expect(await t.locator('td.tbl-empty').first().textContent()).toBe('');
  // Not grouped by default.
  await expect(t.locator('td[rowspan]')).toHaveCount(0);
  // The stored table is untouched.
  expect(await page.evaluate('nodes[0].tables[0].includes("tbl-")')).toBe(false);
  expect(errors).toEqual([]);
});

test('Group rows merges repeated first-column values, splits code and name, and stays display-only', async ({ page }) => {
  const errors = await seed(page, TABLE.replace('<table>', '<table data-group-rows="1">'));
  const t = page.locator('.node-table-line table');
  await expect(t).toHaveClass(/tbl-grouped/);
  const head = t.locator('td.tbl-group-cell').first();
  await expect(head).toHaveAttribute('rowspan', '3');
  await expect(head.locator('.tbl-grp-code')).toHaveText('2001');
  await expect(head.locator('.tbl-grp-name')).toHaveText('Centrallager Vejen');
  await expect(head.locator('.tbl-grp-count')).toHaveText('3 rows');
  // A run of one stays a plain cell; the next group starts with a heavier rule.
  const second = t.locator('td.tbl-group-cell').nth(1);
  await expect(second).not.toHaveAttribute('rowspan', /.+/);
  await expect(second).toHaveText('2401 (Gardermoen)');
  await expect(t.locator('tr.tbl-group-start')).toHaveCount(1);
  // Same in the PDF figure.
  const pdf = await page.evaluate(() => {
    const div = document.createElement('div');
    // @ts-expect-error -- bare global
    div.innerHTML = nodes[0].tables[0];
    // @ts-expect-error -- bare global
    const fig = buildNoteTableFigure(div.querySelector('table'), 1, 0);
    return { grouped: !!fig.querySelector('table.tbl-grouped'), span: fig.querySelector('td[rowspan]')?.getAttribute('rowspan') };
  });
  expect(pdf).toEqual({ grouped: true, span: '3' });
  // Editing shows the full grid.
  await t.locator('td').last().click();
  await expect(page.locator('.node-table-line')).toHaveClass(/editing/);
  await expect(page.locator('.node-table-line table td[rowspan]')).toHaveCount(0);
  await expect(page.locator('.node-table-line table tbody tr').first().locator('td')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('the table menu offers Group rows only when something repeats', async ({ page }) => {
  await seed(page, TABLE);
  const r = await page.evaluate(() => {
    const div = document.createElement('div');
    // @ts-expect-error -- bare global
    div.innerHTML = nodes[0].tables[0];
    const table = div.querySelector('table')!;
    // @ts-expect-error -- bare global
    const item = () => buildChartFeatureItems(table, () => {}).find((i: any) => i.label === 'Group rows');
    const before = item();
    before.onClick();
    const on = table.getAttribute('data-group-rows');
    const after = item();
    const unique = document.createElement('div');
    unique.innerHTML = '<table><tr><th>A</th></tr><tr><td>x</td></tr><tr><td>y</td></tr></table>';
    // @ts-expect-error -- bare global
    const none = buildChartFeatureItems(unique.querySelector('table'), () => {}).find((i: any) => i.label === 'Group rows');
    return { beforeDisabled: !!before.disabled, on, checked: !!after.icon, noneDisabled: !!none.disabled, noneReason: none.title };
  });
  expect(r).toEqual({ beforeDisabled: false, on: '1', checked: true, noneDisabled: true, noneReason: 'Nothing to group: no value repeats in consecutive rows of the first column.' });
});
