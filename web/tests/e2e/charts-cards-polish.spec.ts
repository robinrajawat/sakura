import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Charts and Cards polish: round axis ticks with thousands separators (currency cells chart too),
// an optional title, Small/Medium/Full sizes, a Cards change column (▲/▼) with balanced rows, and
// no blank Contents page in the PDF when a document has too few sections for one.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'chartpolishdoc';
const T = (attrs: string, rows: string[][]) => `<table ${attrs}><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
  + rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
const REVENUE = T('data-feature-chart="1" data-chart-type="bar" data-chart-title="Revenue (EUR)"', [['Quarter', '2025'], ['Q1', '$12,400'], ['Q2', '$18,250'], ['Q3', '$24,300']]);
const MARGIN = T('data-feature-chart="1" data-chart-type="bar" data-chart-size="small"', [['Month', 'Margin'], ['Jan', '4'], ['Feb', '-3']]);
const CARDS = T('data-feature-chart="1" data-chart-type="cards"', [['Metric', 'Value', 'Change'], ['NPS', '47', '+5'], ['Churn', '2.1%', '-0.4%'], ['Users', '12,480', '▲ 8%'], ['Tickets', '312', 'n/a'], ['Uptime', '99.9%', '0']]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, tables }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const n = (id: number, depth: number, text: string, parentId: number | null, t: string[] = []) =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: t, tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [n(1, 0, 'Review', null), n(2, 1, 'Revenue', 1, [tables.REVENUE]), n(3, 1, 'Margin', 1, [tables.MARGIN]), n(4, 1, 'Health', 1, [tables.CARDS])],
        nextId: 5, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Charts', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Charts', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, tables: { REVENUE, MARGIN, CARDS } });
});

async function load(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 1200 });
  await page.goto('file://' + indexPath);
  await page.waitForSelector('.pv-table-cards-grid');
  return errors;
}

test('charts: currency values chart, round ticks with separators, title and size', async ({ page }) => {
  const errors = await load(page);
  const charts = page.locator('.pv-table-chart-figure');
  const revenue = charts.filter({ hasText: 'Revenue (EUR)' });
  // A chart's title is drawn inside the SVG, centred above the plot.
  await expect(revenue.locator('svg text.pv-chart-svg-title')).toHaveText('Revenue (EUR)');
  await expect(revenue.locator('svg')).toHaveAttribute('aria-label', 'Revenue (EUR)');
  await expect(revenue.locator('.pv-table-chart-title')).toHaveCount(0);
  const ticks = await revenue.locator('svg text[text-anchor="end"]').allTextContents();
  expect(ticks).toEqual(['0', '10,000', '20,000', '30,000']);
  // Small: drawn on a 360-wide canvas at 360px, with a negative bar below the zero line.
  const small = page.locator('svg.pv-chart-size-small');
  await expect(small).toHaveAttribute('viewBox', '0 0 360 220');
  expect((await small.boundingBox())!.width).toBeCloseTo(360, 0);
  expect(await small.locator('text[text-anchor="end"]').allTextContents()).toContain('-4');
  expect(errors).toEqual([]);
});

test('Cards: change column with ▲/▼ and balanced rows', async ({ page }) => {
  const errors = await load(page);
  const grid = page.locator('.pv-table-cards-grid');
  expect(await grid.getAttribute('style')).toContain('--cards-cols:3');
  const changes = await grid.locator('.pv-table-card-change').evaluateAll((els) => els.map((e) => [e.className.replace('pv-table-card-change', '').trim(), e.textContent?.trim()]));
  expect(changes).toEqual([['up', '▲ 5'], ['down', '▼ 0.4%'], ['up', '▲ 8%'], ['', 'n/a'], ['flat', '0']]);
  // 5 cards → 3 + 2, not 4 + 1.
  const tops = await grid.locator('.pv-table-card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops.slice(0, 3)).size).toBe(1);
  expect(tops[3]).toBeGreaterThan(tops[0]);
  expect(tops[3]).toBe(tops[4]);
  expect(errors).toEqual([]);
});

test('chart menu: title and size items; Cards allowed with a change column', async ({ page }) => {
  const errors = await load(page);
  const r = await page.evaluate(() => {
    const w = window as any;
    const tables = [...document.querySelectorAll('table')];
    const fresh = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('table')!; };
    const bar = fresh('<table data-feature-chart="1"><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>1</td></tr></table>');
    const labels = w.buildChartFeatureItems(bar, () => {}).map((i: any) => i.label);
    const sizeItem = w.buildChartFeatureItems(bar, () => {}).find((i: any) => i.label === 'Chart size');
    const three = fresh('<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>x</td><td>1</td><td>+1</td></tr></table>');
    const four = fresh('<table><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr><tr><td>x</td><td>1</td><td>2</td><td>3</td></tr></table>');
    w.setTableChartTitle(bar, '  Spaced   title ');
    return {
      labels, sizes: sizeItem.submenu.map((i: any) => i.label),
      cards3: w.tableChartTypeAvailability(three).cards.ok, cards4: w.tableChartTypeAvailability(four).cards.ok,
      title: bar.getAttribute('data-chart-title'), tableCount: tables.length
    };
  });
  expect(r.labels).toEqual(expect.arrayContaining(['Show as', 'Add title…', 'Chart size']));
  expect(r.sizes).toEqual(['Auto (current)', 'Small', 'Medium', 'Full']);
  expect(r.cards3).toBe(true);
  expect(r.cards4).toBe(false);
  expect(r.title).toBe('Spaced title');
  expect(errors).toEqual([]);
});

test('PDF: no blank Contents page when there are too few sections', async ({ page }) => {
  const errors = await load(page);
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const css = document.getElementById('pv-print-override')?.textContent || '';
    return {
      printed: w.__printed,
      tocHidden: document.getElementById('preview-toc')!.classList.contains('pv-toc-hidden-auto'),
      hideRule: /#preview-toc\.pv-toc-hidden-auto\{\s*display:none !important;/.test(css),
      footer: (css.match(/@bottom-center\{[^}]*\}/) || [''])[0]
    };
  });
  expect(r.printed).toBe(true);
  expect(r.tocHidden).toBe(true);
  expect(r.hideRule).toBe(true);
  // The footer counts pages with the browser's own counters, so its total always matches the PDF.
  expect(r.footer).toContain('counter(pages)');
  expect(errors).toEqual([]);
});
