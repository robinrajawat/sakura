import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Total row (owner request). A typed "Total" row is recognised (footer look, kept last when sorting,
// left out of charts), with a hint when it no longer matches its rows; "Use calculated total" swaps it
// for a calculated total row that is never stored as a row (computed on every display, outline and
// PDF), so it can't go stale. Cards show the total as one line under the cards.

const T = (attrs: string, rows: string[][]) =>
  `<table ${attrs}>` + rows.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('') + '</table>';
const ROWS = [['Area', 'Effort'], ['CXP - Frontend/Backend', '15 days'], ['UX/UI', '3 days'], ['ERP - ABAP', '6 days']];
const TYPED = T('', [...ROWS, ['Total', '9 days']]);

async function openWith(page: import('@playwright/test').Page, tables: string[]) {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (!/ServiceWorker/.test(e.message)) errors.push(e.message); });
  await page.goto('file://' + indexPath);
  await page.evaluate((tables) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = tables.map((t, i) => ({ id: i + 1, depth: 0, text: 'Node ' + (i + 1), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [t] }));
    // @ts-expect-error
    nextId = tables.length + 1; collapsedIds = new Set(); selectedId = null; editingId = null; render();
  }, tables);
  return errors;
}
const stored = (page: import('@playwright/test').Page) => page.evaluate('nodes[0].tables[0]') as Promise<string>;

test('a stale typed total is recognised, hinted, and replaced by a calculated total in one click (undoable)', async ({ page }) => {
  const errors = await openWith(page, [TYPED]);
  const total = page.locator('.node-table-line tr.tbl-total');
  await expect(total).toHaveCount(1);
  await expect(total.locator('.tbl-total-hint')).toHaveText('Rows: 24 days');

  await page.locator('.node-table-line').click({ button: 'right' });
  await page.locator('.sb-context-item', { hasText: 'Use calculated total' }).click();
  expect(await stored(page)).toContain('data-total-row="1"');
  expect(await stored(page)).not.toContain('9 days');
  await expect(page.locator('.node-table-line tfoot tr.tbl-total')).toHaveText('Total24 days');
  await expect(page.locator('.tbl-total-hint')).toHaveCount(0);

  // Undo brings the typed row back.
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => undo());
  expect(await stored(page)).toContain('9 days');
  expect(errors).toEqual([]);
});

test('the calculated total follows edits, and is never stored as a row', async ({ page }) => {
  await openWith(page, [T('data-total-row="1"', ROWS)]);
  await expect(page.locator('.node-table-line tfoot tr.tbl-total')).toHaveText('Total24 days');
  await page.evaluate("nodes[0].tables[0] = nodes[0].tables[0].replace('6 days', '16 days'); render();");
  await expect(page.locator('.node-table-line tfoot tr.tbl-total')).toHaveText('Total34 days');
  expect(await stored(page)).not.toContain('Total');
});

test('Total row is offered only when a column can be added up; turning it off removes it', async ({ page }) => {
  await openWith(page, [T('data-total-row="1"', ROWS)]);
  const r = await page.evaluate(() => {
    const w = window as any;
    const fresh = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('table')!; };
    const item = (t: HTMLTableElement) => w.buildChartFeatureItems(t, () => {}).find((i: any) => /Total row|calculated total/.test(i.label));
    const text = item(fresh('<table><tr><th>Code</th><th>Name</th></tr><tr><td>ZN</td><td>Night</td></tr></table>'));
    const plain = item(fresh('<table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>1</td></tr></table>'));
    const on = fresh('<table data-total-row="1"><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>1</td></tr></table>');
    const onItem = item(on);
    onItem.onClick();
    return { text: [text.label, !!text.disabled], plain: [plain.label, !!plain.disabled], on: [onItem.label, !!onItem.icon], after: on.getAttribute('data-total-row') };
  });
  expect(r.text).toEqual(['Total row', true]);
  expect(r.plain).toEqual(['Total row', false]);
  expect(r.on).toEqual(['Total row', true]);
  expect(r.after).toBeNull();
});

test('sorting keeps a typed total last; charts leave it out', async ({ page }) => {
  await openWith(page, [TYPED]);
  const r = await page.evaluate(() => {
    const w = window as any;
    // @ts-expect-error -- bare global from index.html
    const d = document.createElement('div'); d.innerHTML = nodes[0].tables[0];
    const t = d.querySelector('table')!;
    w.tableSortByColumn(t, t.rows[1].cells[0], -1);
    const order = [...t.rows].map((row) => row.cells[0].textContent);
    const series = w.chartSeriesFromTable(t);
    return { order, labels: series[0].labels };
  });
  expect(r.order).toEqual(['Area', 'UX/UI', 'ERP - ABAP', 'CXP - Frontend/Backend', 'Total']);
  expect(r.labels).not.toContain('Total');
});

test('Cards show the total as one line under the cards, not as a card', async ({ page }) => {
  await openWith(page, [T('data-feature-chart="1" data-chart-type="cards" data-total-row="1"', ROWS)]);
  await expect(page.locator('.pv-table-card')).toHaveCount(3);
  await expect(page.locator('.pv-table-cards-total')).toHaveText('Total24 days');
});

test('the PDF prints the total row (calculated, and typed without the outline-only hint)', async ({ page }) => {
  await openWith(page, [T('data-total-row="1"', ROWS), TYPED]);
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    return {
      totals: [...document.querySelectorAll('#preview-doc tr.tbl-total')].map((tr) => tr.textContent),
      hints: document.querySelectorAll('#preview-doc .tbl-total-hint').length
    };
  });
  expect(r.totals).toEqual(['Total24 days', 'Total9 days']);
  expect(r.hints).toBe(0);
});
