import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cards with a long label (owner report, PDF): the icon or swatch sits on the label's first line
// rather than drifting to the middle of a wrapped label, values line up along each row of cards,
// and a label breaks after a slash rather than mid-word ("Frontend/Backe nd").

const picks = JSON.stringify({ 'CXP - Frontend/Backend development': 'code', 'UX/UI': 'people' }).replace(/"/g, '&quot;');
const rows = [['Area', 'Effort'], ['CXP - Frontend/Backend development', '15 days'], ['UX/UI', '3 days'], ['ERP - O2C - Functional', '10 days'], ['ERP - ABAP', '6 days']];
const TABLE = `<table data-feature-chart="1" data-chart-type="cards" data-card-icon-picks="${picks}">`
  + rows.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>').join('') + '</table>';

async function geometry(page: import('@playwright/test').Page, root: string) {
  return page.evaluate((root) => [...document.querySelectorAll(root + ' .pv-table-card')].map((card) => {
    const mark = card.querySelector('.pv-table-card-icon svg, .pv-table-card-swatch')!.getBoundingClientRect();
    const text = card.querySelector('.pv-table-card-label-text')!;
    const range = document.createRange(); range.selectNodeContents(text);
    const first = range.getClientRects()[0];
    return { label: text.textContent, markMid: mark.top + mark.height / 2, lineMid: first.top + first.height / 2, valueTop: card.querySelector('.pv-table-card-value')!.getBoundingClientRect().top, lines: Math.round(text.getBoundingClientRect().height / first.height) };
  }), root);
}

function check(g: Awaited<ReturnType<typeof geometry>>) {
  expect(g).toHaveLength(4);
  for (const c of g) expect(Math.abs(c.markMid - c.lineMid), c.label!).toBeLessThan(2);
  expect(g.some((c) => c.lines > 1)).toBe(true);
  const tops = g.map((c) => c.valueTop);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate((t) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Effort', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [t] }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); selectedId = null; editingId = null; render();
  }, TABLE);
});

test('on screen: icons on the first label line, values aligned, slash breaks', async ({ page }) => {
  check(await geometry(page, '.node-table-line'));
  expect(await page.locator('.node-table-line .pv-table-card-label-text').first().innerHTML()).toBe('CXP - Frontend/<wbr>Backend development');
});

test('in the PDF: icons on the first label line, values aligned', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
  });
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  await page.screenshot({ path: 'test-results/pdf-cards.png', fullPage: true });
  check(await geometry(page, '#preview-doc'));
});
