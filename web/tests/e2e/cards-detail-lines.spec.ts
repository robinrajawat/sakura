import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cards with detail lines (owner's "Special freight | Amount | Scales"): a column after the value
// that isn't written as changes shows as a note line under the value instead of refusing Cards.
// Values and notes line up along each row of cards, on screen and in the PDF; with two detail
// columns each line starts with its header.

const T = (rows: string[][]) =>
  '<table data-feature-chart="1" data-chart-type="cards">'
  + rows.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('') + '</table>';
const NOTES = T([
  ['Cost item', 'Amount', 'Note'],
  ['Special freight', 'DKK 1,500', 'Scales and pallet jacks, booked per trip'],
  ['Standard freight', 'DKK 400', 'Per pallet'],
  ['Installation at the customer site', 'DKK 2,250', ''],
  ['Insurance', 'DKK 120', 'Included']
]);
const TWO = T([['Metric', 'Value', 'Owner', 'Change', 'Due'], ['Revenue', '€1.24M', 'Ana', '+12%', 'Fri'], ['Churn', '2.1%', 'Ben', '-0.4%', '']]);

async function open(page: import('@playwright/test').Page, tables: string[]) {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!/ServiceWorker/.test(e.message)) errors.push(e.message); });
  await page.goto('file://' + indexPath);
  await page.evaluate((tables) => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error -- bare globals from index.html
    nodes = tables.map((t, i) => ({ id: i + 1, depth: 0, text: 'Node ' + (i + 1), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [t] }));
    // @ts-expect-error
    nextId = tables.length + 1; collapsedIds = new Set(); selectedId = null; editingId = null; render();
  }, tables);
  return errors;
}

async function rowTops(page: import('@playwright/test').Page, root: string) {
  return page.evaluate((root) => [...document.querySelectorAll(root + ' .pv-table-cards-grid')[0].querySelectorAll('.pv-table-card')].map((card) => ({
    value: card.querySelector('.pv-table-card-value')!.getBoundingClientRect().top,
    note: card.querySelector('.pv-table-card-details')?.getBoundingClientRect().top ?? null
  })), root);
}

function checkAligned(g: { value: number; note: number | null }[]) {
  // The first visual row is the first three or four cards (cardsGridColumns); compare those that share a row.
  const firstRow = g.filter((c) => Math.abs(c.value - g[0].value) < 40);
  expect(firstRow.length).toBeGreaterThan(1);
  const values = firstRow.map((c) => c.value);
  expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1);
  const notes = firstRow.map((c) => c.note).filter((n): n is number => n !== null);
  expect(notes.length).toBeGreaterThan(1);
  expect(Math.max(...notes) - Math.min(...notes)).toBeLessThan(1);
}

test('a text column shows as a note line under the value, empty notes leave no line', async ({ page }) => {
  const errors = await open(page, [NOTES]);
  const cards = page.locator('.node-table-line .pv-table-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0).locator('.pv-table-card-details')).toHaveText('Scales and pallet jacks, booked per trip');
  await expect(cards.nth(0).locator('.pv-table-card-detail-label')).toHaveCount(0);
  await expect(cards.nth(2).locator('.pv-table-card-details')).toHaveCount(0);
  await expect(cards.locator('.pv-table-card-change')).toHaveCount(0);
  const value = (await cards.nth(0).locator('.pv-table-card-value').boundingBox())!;
  const note = (await cards.nth(0).locator('.pv-table-card-details').boundingBox())!;
  expect(note.y).toBeGreaterThanOrEqual(value.y + value.height);
  checkAligned(await rowTops(page, '.node-table-line'));
  expect(errors).toEqual([]);
});

test('two detail columns are labelled by their header; the signed column stays the change pill', async ({ page }) => {
  await open(page, [TWO]);
  const first = page.locator('.node-table-line .pv-table-card').first();
  await expect(first.locator('.pv-table-card-change')).toHaveClass(/up/);
  await expect(first.locator('.pv-table-card-detail')).toHaveText(['OwnerAna', 'DueFri']);
  await expect(first.locator('.pv-table-card-detail-label')).toHaveText(['Owner', 'Due']);
  await expect(page.locator('.node-table-line .pv-table-card').nth(1).locator('.pv-table-card-detail')).toHaveText(['OwnerBen']);
});

test('in the PDF: notes print under the values, aligned along the row', async ({ page }) => {
  await open(page, [NOTES]);
  await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
  });
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  await expect(page.locator('#preview-doc .pv-table-card-details')).toHaveCount(3);
  checkAligned(await rowTops(page, '#preview-doc'));
});
