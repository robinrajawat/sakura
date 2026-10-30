import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › API request (owner 2026-10-30: document API calls in specs). A Field | Value table with
// a Method and a URL shows as a request card; Copy as cURL puts the command on the clipboard.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const API = '<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>'
  + '<tr><td>Method</td><td>GET</td></tr>'
  + '<tr><td>URL</td><td>{{baseUrl}}/orders</td></tr>'
  + '<tr><td>Query</td><td>status=open</td></tr>'
  + '<tr><td>Header</td><td>Authorization: Bearer {{token}}</td></tr>'
  + '<tr><td>Status</td><td>200 OK</td></tr>'
  + '<tr><td>Response</td><td>[{"id":"4711"}]</td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((table) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'apidoc';
      const n = (id: number, text: string, t: string[]) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: t, tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [n(1, 'List open orders', [table]), n(2, 'Next', [])],
        nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'API', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'API', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, API);
});

test('Show as › API request shows a request card, and Copy as cURL copies the command', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.locator('.node-table-line').first().click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('API request', { exact: true }).click();

  const card = page.locator('.pv-api');
  await expect(card).toHaveAttribute('data-method', 'get');
  await expect(card.locator('.pv-api-method')).toHaveText('GET');
  // Query rows are appended to the URL; {{variables}} stay as typed.
  await expect(card.locator('.pv-api-url')).toHaveText('{{baseUrl}}/orders?status=open');
  await expect(card.locator('.pv-api-key')).toContainText(['Authorization']);
  await expect(card.locator('.pv-api-status')).toHaveText('200 OK');
  // JSON is pretty-printed.
  await expect(card.locator('.pv-api-code')).toContainText('"id": "4711"');

  await card.locator('.pv-api-curl').click();
  const curl = await page.evaluate(() => navigator.clipboard.readText());
  expect(curl).toBe("curl \\\n  '{{baseUrl}}/orders?status=open' \\\n  -H 'Authorization: Bearer {{token}}'");

  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="api"');
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => renderPreviewBody());
  await expect(page.locator('#preview-overlay .pv-api .pv-api-method')).toHaveText('GET');
  expect(errors).toEqual([]);
});

test('API request is greyed out for a table without a Method and URL, and is a table starter', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<table><tr><th>Field</th><th>Value</th></tr><tr><td>Owner</td><td>Sam</td></tr></table>';
    const item = (window as any).buildChartFeatureItems(d.querySelector('table'), () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'API request');
    const starter = (window as any).tableStarterHtml('api');
    return { disabled: item.disabled, title: item.title, starter };
  });
  expect(r.disabled).toBe(true);
  expect(r.title).toContain('Method');
  expect(r.starter).toContain('data-table-display="api"');
  expect(r.starter).toContain('"orderId"');
});
