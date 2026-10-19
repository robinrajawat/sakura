import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › Row cards (owner request 2026-10-19): a wide table of records as one card per row, in a
// grid. Only ever chosen from Show as; a table never switches to it on its own.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const T = '<table><tr><th>Level</th><th>Classification</th><th>Risk</th><th>Practice</th></tr>'
  + '<tr><td><b>Level A</b></td><td>Gold standard</td><td><b>Zero risk.</b> Upgrade-safe.</td><td>Released APIs only.</td></tr>'
  + '<tr><td><b>Level B</b></td><td>Classic</td><td><b>Low risk.</b> Stable.</td><td></td></tr>'
  + '<tr><td><b>Level C</b></td><td>Conditionally clean</td><td><b>Medium risk.</b></td><td>Unreleased objects.</td></tr></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'rcdoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Levels', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], tags: [], styles: {} }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'RC', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'RC', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, T);
});

test('Show as › Row cards shows one card per row, with the headers as field labels', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  // Never automatic: a wide table stays a table until someone picks Row cards.
  await expect(page.locator('.pv-rowcards')).toHaveCount(0);
  await page.locator('.node-table-line').first().click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Row cards', { exact: true }).click();

  const cards = page.locator('.pv-rowcards .pv-rc-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.pv-rc-title')).toHaveText(['Level A', 'Level B', 'Level C']);
  // A short second column is the subtitle; the rest are labelled fields, formatting kept.
  await expect(cards.first().locator('.pv-rc-sub')).toHaveText('Gold standard');
  await expect(cards.first().locator('.pv-rc-label')).toHaveText(['Risk', 'Practice']);
  await expect(cards.first().locator('.pv-rc-value b')).toHaveText('Zero risk.');
  // An empty cell is left off its card rather than shown as a blank field.
  await expect(cards.nth(1).locator('.pv-rc-label')).toHaveText(['Risk']);
  // A grid on desktop: the three cards sit side by side.
  const tops = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="rowcards"');

  // Back to a table from the same menu.
  await page.locator('.node-table-line').first().click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Table', { exact: true }).click();
  await expect(page.locator('.pv-rowcards')).toHaveCount(0);
  await expect(page.locator('.node-table-line table')).toHaveCount(1);
  expect(errors).toEqual([]);
});
