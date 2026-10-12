import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › Timeline: dates in column A, the event in B, an optional detail in C. Rows show in
// date order on a vertical line -- done / next / upcoming against today -- with undated rows last.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const TL = '<table><thead><tr><th>Date</th><th>Milestone</th><th>Notes</th></tr></thead><tbody>'
  + '<tr><td>2099-03-01</td><td>Later</td><td></td></tr>'
  + '<tr><td>2001-01-15</td><td>Kickoff</td><td>Long ago</td></tr>'
  + '<tr><td>TBD</td><td>Rollout</td><td></td></tr>'
  + '<tr><td>Feb 1, 2099</td><td>Soon</td><td>Next one</td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((tl) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'timelinedoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [tl], tags: [], styles: {} }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Timeline', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Timeline', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, TL);
});

test('Show as › Timeline orders rows by date and marks done / next / upcoming', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.locator('.node-table-line').click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Timeline', { exact: true }).click();

  const items = await page.locator('.pv-timeline .pv-tl-item').evaluateAll((els) => els.map((e) => [
    e.querySelector('.pv-tl-date')?.textContent,
    e.querySelector('.pv-tl-event')?.childNodes[0]?.textContent,
    e.className.replace('pv-tl-item', '').trim()
  ]));
  expect(items).toEqual([
    ['2001-01-15', 'Kickoff', 'done'],
    ['Feb 1, 2099', 'Soon', 'next'],
    ['2099-03-01', 'Later', 'upcoming'],
    ['TBD', 'Rollout', '']
  ]);
  await expect(page.locator('.pv-tl-next')).toHaveCount(1);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="timeline"');

  // Reaches the PDF too.
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => renderPreviewBody());
  await expect(page.locator('#preview-overlay .pv-timeline .pv-tl-item')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('Timeline is greyed out for a table without dates', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>1</td></tr><tr><td>y</td><td>2</td></tr></table>';
    const t = d.querySelector('table');
    const item = (window as any).buildChartFeatureItems(t, () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'Timeline');
    return { disabled: item.disabled, title: item.title };
  });
  expect(r.disabled).toBe(true);
  expect(r.title).toContain('dates in the first column');
});
