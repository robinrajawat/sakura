import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › Status board: open points grouped into lanes by their Status column -- Open,
// In progress, Blocked, other statuses, Done -- each row a card with owner, due date (red once
// overdue) and a note. A plain table with a Status column gets coloured status pills instead.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const OP = '<table><thead><tr><th>Open point</th><th>Owner</th><th>Status</th><th>Due</th><th>Notes</th></tr></thead><tbody>'
  + '<tr><td>Label size</td><td>Ana</td><td>Done</td><td>2001-01-10</td><td></td></tr>'
  + '<tr><td>Carrier API keys</td><td>Raj</td><td>Blocked</td><td>2001-02-01</td><td>Waiting on vendor</td></tr>'
  + '<tr><td>Depot list</td><td>Ana</td><td>Open</td><td>2099-01-01</td><td></td></tr>'
  + '<tr><td>Pilot plan</td><td>Mo</td><td>In progress</td><td></td><td></td></tr>'
  + '<tr><td>Old idea</td><td></td><td>Cancelled</td><td></td><td></td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((op) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'boarddoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Open points', parentId: null, isCheckbox: false, checked: false, note: '', tables: [op], tags: [], styles: {} }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Board', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Board', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, OP);
});

test('plain table: the Status column shows coloured pills', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const pills = await page.locator('.node-table-line .tbl-status-pill').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute('data-group')]));
  expect(pills).toEqual([['Done', 'done'], ['Blocked', 'blocked'], ['Open', 'open'], ['In progress', 'progress'], ['Cancelled', 'other']]);
  // Display only: the stored table is untouched.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).not.toContain('tbl-status-pill');
});

test('Show as › Status board groups items into lanes with owner, due and overdue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.locator('.node-table-line').click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Status board', { exact: true }).click();

  const lanes = await page.locator('.pv-board .pv-board-lane').evaluateAll((els) => els.map((l) => [
    l.querySelector('.pv-board-label')?.textContent,
    l.querySelector('.pv-board-count')?.textContent,
    [...l.querySelectorAll('.pv-board-item')].map((i) => i.textContent).join('|')
  ]));
  expect(lanes).toEqual([
    ['Open', '1', 'Depot list'], ['In progress', '1', 'Pilot plan'], ['Blocked', '1', 'Carrier API keys'],
    ['Cancelled', '1', 'Old idea'], ['Done', '1', 'Label size']
  ]);
  const blocked = page.locator('.pv-board-lane[data-group="blocked"] .pv-board-card');
  await expect(blocked.locator('.pv-board-owner')).toHaveText('Raj');
  await expect(blocked.locator('.pv-board-note')).toHaveText('Waiting on vendor');
  // Past due and not done → overdue; a past date in Done is not.
  await expect(blocked.locator('.pv-board-due.overdue')).toHaveText('2001-02-01');
  await expect(page.locator('.pv-board-lane[data-group="done"] .pv-board-due.overdue')).toHaveCount(0);
  await expect(page.locator('.pv-board-lane[data-group="open"] .pv-board-due.overdue')).toHaveCount(0);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="board"');

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => renderPreviewBody());
  await expect(page.locator('#preview-overlay .pv-board .pv-board-card')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('Status board is greyed out without a status column', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<table><tr><th>City</th><th>Sales</th></tr><tr><td>Paris</td><td>1</td></tr><tr><td>Rome</td><td>2</td></tr></table>';
    const item = (window as any).buildChartFeatureItems(d.querySelector('table'), () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'Status board');
    return { disabled: item.disabled, title: item.title };
  });
  expect(r.disabled).toBe(true);
  expect(r.title).toContain('Status column');
});
