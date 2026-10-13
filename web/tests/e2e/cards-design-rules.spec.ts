import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cards redesign: label first (colour square, or the picked icon in its place), value with its
// change pill beside it; and the tighter Show as › Cards rules from src/utils/tableDisplay.ts
// (2–3 columns, 2–8 rows, numbers in the value column, a signed/arrowed change column). A Cards
// table edited out of shape shows as a plain table.

const T = (attrs: string, rows: string[][]) =>
  `<table ${attrs}>` + rows.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('') + '</table>';
const CARDS = T('data-feature-chart="1" data-chart-type="cards"', [['Metric', 'Value', 'Change'], ['Revenue', '€1.24M', '+12%'], ['Response', '3.2 h', '−0.6 h']]);
const TOO_MANY = T('data-feature-chart="1" data-chart-type="cards"', [['M', 'V'], ...Array.from({ length: 9 }, (_, i) => ['Row ' + i, String(i + 1)])]);

async function openWith(page: import('@playwright/test').Page, tables: string[]) {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!/ServiceWorker/.test(e.message)) errors.push(e.message); });
  await page.goto('file://' + indexPath);
  await page.evaluate((tables) => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error -- bare globals from index.html
    nodes = tables.map((t, i) => ({ id: i + 1, depth: 0, text: 'Node ' + (i + 1), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [t] }));
    // @ts-expect-error
    nextId = tables.length + 1; collapsedIds = new Set(); selectedId = null; editingId = null; render();
  }, tables);
  return errors;
}

test('a card shows label first, then the value with its change pill on the same line', async ({ page }) => {
  const errors = await openWith(page, [CARDS]);
  const card = page.locator('.pv-table-card').first();
  await expect(card.locator('.pv-table-card-label')).toHaveText('Revenue');
  await expect(card.locator('.pv-table-card-label .pv-table-card-swatch')).toHaveCount(1);
  const label = (await card.locator('.pv-table-card-label').boundingBox())!;
  const value = (await card.locator('.pv-table-card-value').boundingBox())!;
  const change = (await card.locator('.pv-table-card-change').boundingBox())!;
  expect(label.y + label.height).toBeLessThanOrEqual(value.y + 1);
  expect(change.x).toBeGreaterThan(value.x + value.width);
  expect(change.y).toBeLessThan(value.y + value.height);
  await expect(card.locator('.pv-table-card-change')).toHaveClass(/up/);
  await expect(page.locator('.pv-table-card').nth(1).locator('.pv-table-card-change')).toHaveClass(/down/);
  expect(errors).toEqual([]);
});

test('a picked icon takes the colour square\'s place', async ({ page }) => {
  const withIcon = CARDS.replace('<table ', `<table data-card-icon-picks='{"Revenue":"time"}' `);
  await openWith(page, [withIcon]);
  const first = page.locator('.pv-table-card').nth(0);
  await expect(first.locator('.pv-table-card-label .pv-table-card-icon')).toHaveCount(1);
  await expect(first.locator('.pv-table-card-swatch')).toHaveCount(0);
  await expect(page.locator('.pv-table-card').nth(1).locator('.pv-table-card-swatch')).toHaveCount(1);
});

test('Show as › Cards is offered only for tables that fit, with the reason otherwise', async ({ page }) => {
  await openWith(page, []);
  const r = await page.evaluate(() => {
    const w = window as any;
    const fresh = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('table')!; };
    const cardsItem = (html: string) => w.buildChartFeatureItems(fresh(html), () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'Cards');
    return {
      fits: cardsItem('<table><tr><th>M</th><th>V</th></tr><tr><td>A</td><td>6 days</td></tr><tr><td>B</td><td>31 days</td></tr></table>'),
      owner: cardsItem('<table><tr><th>Item</th><th>Cost</th><th>Owner</th></tr><tr><td>Laptop</td><td>1,200</td><td>Ana</td></tr><tr><td>Desk</td><td>300</td><td>Ben</td></tr></table>'),
      single: cardsItem('<table><tr><th>V</th></tr><tr><td>1</td></tr><tr><td>2</td></tr></table>'),
      oneRow: cardsItem('<table><tr><th>M</th><th>V</th></tr><tr><td>A</td><td>1</td></tr></table>')
    };
  });
  expect(r.fits.disabled).toBeFalsy();
  expect(r.owner.disabled).toBe(true);
  expect(r.owner.title).toContain('third column');
  expect(r.single.disabled).toBe(true);
  expect(r.single.title).toContain('2 or 3 columns');
  expect(r.oneRow.disabled).toBe(true);
});

test('a Cards table with more than 8 rows shows as a plain table', async ({ page }) => {
  const errors = await openWith(page, [TOO_MANY]);
  await expect(page.locator('.pv-table-cards-grid')).toHaveCount(0);
  await expect(page.locator('.node-table-line table')).toHaveCount(1);
  expect(errors).toEqual([]);
});
