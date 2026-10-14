import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › Inline (owner request): a two-column code/description table as one running line,
// "ZN Night Distribution · ZL KL 10:00 Fixed" -- codes in small monospace accent, descriptions muted,
// "·" between entries, no boxes.

const SHIP = '<table><tr><th>Shipping Condition</th><th>Description</th></tr><tr><td>ZN</td><td>Night Distribution</td></tr><tr><td>ZL</td><td>KL 10:00 Fixed</td></tr><tr><td>ZP</td><td>Pickup</td></tr></table>';

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

test('Show as › Inline shows the table as one line, key bold, entries separated by a dot', async ({ page }) => {
  const errors = await openWith(page, [SHIP]);
  await page.locator('.node-table-line').click({ button: 'right' });
  await page.locator('.sb-context-item', { hasText: 'Show as' }).hover();
  await page.locator('.sb-context-submenu .sb-context-item', { hasText: /^Inline$/ }).click();
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="inline"');
  const line = page.locator('.node-table-line .pv-table-inline');
  await expect(line).toHaveText('ZN Night Distribution · ZL KL 10:00 Fixed · ZP Pickup');
  await expect(line.locator('code')).toHaveText(['ZN', 'ZL', 'ZP']);
  // The menu marks it as the current display.
  const current = await page.evaluate(() => {
    const d = document.createElement('div');
    // @ts-expect-error -- bare global
    d.innerHTML = nodes[0].tables[0];
    return (window as any).buildChartFeatureItems(d.querySelector('table'), () => {}).find((i: any) => i.label === 'Show as').submenu.filter((i: any) => i.current).map((i: any) => i.label);
  });
  expect(current).toEqual(['Inline']);
  expect(errors).toEqual([]);
});

test('Inline is offered only for two-column tables, and prints in the PDF', async ({ page }) => {
  await openWith(page, [SHIP.replace('<table>', '<table data-table-display="inline">')]);
  const r = await page.evaluate(async () => {
    const w = window as any;
    const fresh = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('table')!; };
    const inlineItem = (t: HTMLTableElement) => w.buildChartFeatureItems(t, () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'Inline');
    const three = inlineItem(fresh('<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>x</td><td>y</td><td>z</td></tr><tr><td>x</td><td>y</td><td>z</td></tr></table>'));
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    return { threeDisabled: !!three.disabled, pdf: document.querySelector('#preview-doc .pv-table-inline')?.textContent };
  });
  expect(r.threeDisabled).toBe(true);
  expect(r.pdf).toBe('ZN Night Distribution · ZL KL 10:00 Fixed · ZP Pickup');
});
