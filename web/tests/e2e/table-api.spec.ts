import { test, expect } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';
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

test('the API request form edits the card: method, URL, query, headers, body; Esc cancels; one undo step', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('file://' + indexPath);
  // The table is stored as an API request already.
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].tables[0] = nodes[0].tables[0].replace('<table>', '<table data-table-display="api">'); render();
  });
  const card = page.locator('.pv-api');
  await card.dblclick();
  const form = page.locator('#api-editor-overlay');
  await expect(form).toHaveClass(/open/);
  await expect(page.locator('#api-ed-url')).toBeFocused();
  await expect(page.locator('#api-ed-url')).toHaveValue('{{baseUrl}}/orders');
  await expect(page.locator('#api-ed-query .api-ed-k')).toHaveValue('status');

  // Esc leaves the card as it was.
  await page.locator('#api-ed-url').fill('/changed');
  await page.keyboard.press('Escape');
  await expect(form).not.toHaveClass(/open/);
  await expect(card.locator('.pv-api-url')).toHaveText('{{baseUrl}}/orders?status=open');

  // Edit and save.
  await card.dblclick();
  await page.locator('#api-ed-method').selectOption('POST');
  await page.locator('#api-ed-url').fill('{{baseUrl}}/orders');
  await page.locator('#api-ed-query .api-ed-remove').click();
  await page.locator('.api-ed-add[data-add="headers"]').click();
  const h = page.locator('#api-ed-headers .api-ed-pair').last();
  await h.locator('.api-ed-k').fill('Content-Type');
  await h.locator('.api-ed-v').fill('application/json');
  await page.locator('#api-ed-body').fill('{"id":"4711"}');
  await page.locator('.api-ed-format[data-format="api-ed-body"]').click();
  await expect(page.locator('#api-ed-body')).toHaveValue('{\n  "id": "4711"\n}');
  await page.locator('#api-ed-save').click();
  await expect(form).not.toHaveClass(/open/);
  await expect(card).toHaveAttribute('data-method', 'post');
  await expect(card.locator('.pv-api-url')).toHaveText('{{baseUrl}}/orders');
  await expect(card.locator('.pv-api-key')).toHaveText(['Authorization', 'Content-Type']);
  // The table keeps its display and stays a plain Field | Value table underneath.
  // @ts-expect-error -- bare global from index.html
  const html = await page.evaluate(() => nodes[0].tables[0]);
  expect(html).toContain('data-table-display="api"');
  expect(html).toContain('<td>Method</td><td>POST</td>');

  // One undo step brings the old request back.
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(card).toHaveAttribute('data-method', 'get');
});

test('the form needs a URL, warns about invalid JSON, and Edit as table opens the grid', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].tables[0] = nodes[0].tables[0].replace('<table>', '<table data-table-display="api">'); render();
  });
  await page.locator('.pv-api').dblclick();
  await page.locator('#api-ed-url').fill('');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#api-ed-url-err')).toBeVisible();
  await expect(page.locator('#api-editor-overlay')).toHaveClass(/open/);
  await page.locator('#api-ed-body').fill('{not json');
  await page.locator('.api-ed-format[data-format="api-ed-body"]').click();
  await expect(page.locator('[data-err-for="api-ed-body"]')).toBeVisible();
  await page.locator('#api-ed-astable').click();
  await expect(page.locator('#api-editor-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('.node-table-line td[contenteditable="true"]').first()).toBeVisible();
});

test('Paste from Postman (cURL) fills a new API request and drops the sample text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('file://' + indexPath);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openTableStartMenu(2, { x: 300, y: 200 }));
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'API request' }).click();
  await expect(page.locator('#api-editor-overlay')).toHaveClass(/open/);
  const curl = "curl --location 'https://erp.example.com/PostalCodeSet?$format=json' \\\n"
    + "--header 'Authorization: Bearer real-secret' \\\n--data '{\"PostalCode\":\"2300\"}'";
  // Pasting into the URL box fills the whole form.
  await page.locator('#api-ed-url').focus();
  await page.evaluate((t) => {
    const dt = new DataTransfer(); dt.setData('text', t);
    document.getElementById('api-ed-url')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, curl);
  await expect(page.locator('#api-ed-method')).toHaveValue('POST');
  await expect(page.locator('#api-ed-url')).toHaveValue('https://erp.example.com/PostalCodeSet');
  await expect(page.locator('#api-ed-query .api-ed-k')).toHaveValue('$format');
  await expect(page.locator('#api-ed-headers .api-ed-v')).toHaveValue('Bearer {{token}}');
  await expect(page.locator('#api-ed-desc')).toHaveValue('');
  await expect(page.locator('#api-ed-status')).toHaveValue('');

  // The button reads the clipboard; text that isn't cURL opens the paste box with a hint.
  await page.evaluate(() => navigator.clipboard.writeText('not a command'));
  await page.locator('#api-ed-curl-btn').click();
  await expect(page.locator('#api-ed-curl')).toBeVisible();
  await page.locator('#api-ed-curl').fill('hello');
  await expect(page.locator('#api-ed-curl-err')).toBeVisible();
  await page.locator('#api-ed-curl').fill("curl -X DELETE 'https://a/orders/1'");
  await expect(page.locator('#api-ed-curl-wrap')).toBeHidden();
  await expect(page.locator('#api-ed-method')).toHaveValue('DELETE');

  await page.locator('#api-ed-save').click();
  // @ts-expect-error -- bare global from index.html
  const html = await page.evaluate(() => nodes[1].tables[0]);
  expect(html).toContain('<td>DELETE</td>');
  expect(html).not.toContain('real-secret');
});

test('the card says Copy for Postman, and right-click copies or exports just this request', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].tables[0] = nodes[0].tables[0].replace('<table>', '<table data-table-display="api">').replace('<tr><td>Status</td>', '<tr><td>Description</td><td>Open orders only</td></tr><tr><td>Status</td>'); render();
  });
  const card = page.locator('.pv-api');
  await expect(card.locator('.pv-api-curl')).toHaveText('Copy for Postman');

  await card.click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Copy for Postman' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("'{{baseUrl}}/orders?status=open'");

  await card.click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Export this request (.json)' }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toBe('List open orders.postman_collection.json');
  const out = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  expect(out.info.name).toBe('List open orders');
  expect(out.item).toHaveLength(1);
  // Unlike cURL, the file keeps the description and the example response.
  expect(out.item[0].request.description).toBe('Open orders only');
  expect(out.item[0].response[0]).toMatchObject({ code: 200, status: 'OK' });
});
