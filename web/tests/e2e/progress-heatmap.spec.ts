import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Progress bars (a table display beside chips and charts) and heat-map shading of plain tables.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'progressheatdoc';
const T = (attrs: string, rows: string[][]) => `<table ${attrs}><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
  + rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
const PROGRESS = T('data-table-display="progress"', [['Workstream', 'Done'], ['Login', '100%'], ['Billing', '62%'], ['SSO', 'n/a']]);
const TARGET = T('data-table-display="progress"', [['Team', 'Closed', 'Goal'], ['Support', '31', '50'], ['Sales', '48', '40']]);
const FRACTIONS = T('data-table-display="progress"', [['Item', 'Share'], ['A', '0.25'], ['B', '0.8']]);
const HEAT = T('data-heatmap="1"', [['Region', 'Revenue', 'Note'], ['North', '$12,400', 'ok'], ['South', '$9,800', 'late'], ['East', '$21,300', '']]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, tables }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const n = (id: number, depth: number, text: string, parentId: number | null, t: string[] = []) =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: t, tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [n(1, 0, 'Status', null), n(2, 1, 'Workstreams', 1, [tables.PROGRESS]), n(3, 1, 'Targets', 1, [tables.TARGET]),
          n(4, 1, 'Shares', 1, [tables.FRACTIONS]), n(5, 1, 'Revenue', 1, [tables.HEAT])],
        nextId: 6, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Status', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Status', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, tables: { PROGRESS, TARGET, FRACTIONS, HEAT } });
});

async function load(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('file://' + indexPath);
  await page.waitForSelector('.pv-table-progress');
  return errors;
}

const rowsOf = (page: import('@playwright/test').Page, i: number) =>
  page.locator('.pv-table-progress').nth(i).locator('.pv-progress-row').evaluateAll((rows) => rows.map((r) => ({
    label: r.querySelector('.pv-progress-label')?.textContent,
    value: r.querySelector('.pv-progress-value')?.textContent,
    width: (r.querySelector('.pv-progress-fill') as HTMLElement).style.width,
    done: r.querySelector('.pv-progress-fill')!.classList.contains('done')
  })));

test('progress bars: percentages, value of target, fractions', async ({ page }) => {
  const errors = await load(page);
  expect(await rowsOf(page, 0)).toEqual([
    { label: 'Login', value: '100%', width: '100%', done: true },
    { label: 'Billing', value: '62%', width: '62%', done: false },
    { label: 'SSO', value: 'n/a', width: '0%', done: false }
  ]);
  // Over the goal: the bar stops at 100%, the number doesn't.
  expect(await rowsOf(page, 1)).toEqual([
    { label: 'Support', value: '62%', width: '62%', done: false },
    { label: 'Sales', value: '120%', width: '100%', done: true }
  ]);
  expect((await rowsOf(page, 2)).map((r) => r.value)).toEqual(['25%', '80%']);
  expect(errors).toEqual([]);
});

test('heat-map shades numeric cells at render time only', async ({ page }) => {
  const errors = await load(page);
  const heat = await page.locator('table[data-heatmap="1"] tbody tr').evaluateAll((rows) =>
    rows.map((r) => [...(r as HTMLTableRowElement).cells].map((c) => c.getAttribute('data-heat'))));
  expect(heat).toEqual([[null, '2', null], [null, '1', null], [null, '5', null]]);
  // @ts-expect-error -- bare global from index.html
  const stored = await page.evaluate(() => nodes.find((n: any) => n.id === 5).tables[0] as string);
  expect(stored).not.toContain('data-heat="');
  expect(errors).toEqual([]);
});

test('menu: progress bars and heat-map options, mutually exclusive displays', async ({ page }) => {
  const errors = await load(page);
  const r = await page.evaluate(() => {
    const w = window as any;
    const fresh = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.querySelector('table')!; };
    const plain = fresh('<table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>40%</td></tr><tr><td>y</td><td>70%</td></tr></table>');
    const labels = w.buildChartFeatureItems(plain, () => {}).map((i: any) => i.label);
    const showAs = w.buildChartFeatureItems(plain, () => {}).find((i: any) => i.label === 'Show as').submenu
      .map((i: any) => i.heading ? '# ' + i.heading : i.label + (i.disabled ? ' (n/a)' : '') + (i.current ? ' ✓' : ''));
    const heatItem = w.buildChartFeatureItems(plain, () => {}).find((i: any) => i.label === 'Heat-map');
    w.setTableHeatmap(plain, true, true);
    const reversed = plain.getAttribute('data-heatmap-reverse');
    w.setTableProgress(plain, true);
    const afterProgress = { display: plain.getAttribute('data-table-display'), heat: plain.getAttribute('data-heatmap') };
    const progressItems = w.buildChartFeatureItems(plain, () => {});
    const progressLabels = progressItems.map((i: any) => i.label + (i.disabled ? ' (off)' : ''));
    const progressCurrent = progressItems.find((i: any) => i.label === 'Show as').submenu.filter((i: any) => i.current).map((i: any) => i.label);
    w.setTableFeatureChart(plain, true);
    return { labels, showAs, progressCurrent, heatSub: heatItem.submenu.map((i: any) => i.label), reversed, afterProgress, progressLabels, displayAfterChart: plain.getAttribute('data-table-display') };
  });
  expect(r.labels).toEqual(['Show as', 'Heat-map', 'Group rows', 'Add title…', 'Chart size']);
  expect(r.showAs).toEqual(['Table ✓', 'Chips', 'Inline', 'Cards', 'Progress bars', 'Status board (n/a)', 'Pros & cons (n/a)', '# Timeline', 'Vertical (n/a)', 'Horizontal (n/a)', '# Chart', 'Bar', 'Stacked bar (n/a)', 'Line', 'Pie', 'Doughnut']);
  expect(r.heatSub).toEqual(['Off (current)', 'Higher is darker', 'Lower is darker']);
  expect(r.reversed).toBe('1');
  expect(r.afterProgress).toEqual({ display: 'progress', heat: null });
  // Same menu shape; heat-map, title and size don't apply to progress bars, so they're disabled.
  expect(r.progressLabels).toEqual(['Show as', 'Heat-map (off)', 'Group rows (off)', 'Add title… (off)', 'Chart size (off)']);
  expect(r.progressCurrent).toEqual(['Progress bars']);
  expect(r.displayAfterChart).toBeNull();
  expect(errors).toEqual([]);
});
