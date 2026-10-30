import { test, expect } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Postman (owner 2026-10-30): Import › Postman collection makes a new document — folders as parent
// rows, each request a row with an API request card — and Export › Postman collection writes the
// document's API requests back as a v2.1 collection.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const COLLECTION = {
  info: { name: 'Orders API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Orders',
      item: [{
        name: 'Create order',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          url: { raw: '{{baseUrl}}/orders', host: ['{{baseUrl}}'], path: ['orders'] },
          body: { mode: 'raw', raw: '{\n  "id": "4711"\n}' }
        },
        response: [{ name: 'Created', code: 201, status: 'Created', body: '{"status":"accepted"}' }]
      }]
    },
    { name: 'Health', request: { method: 'GET', url: 'https://api.example.com/health' } }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
});

test('a Postman collection imports as rows with API cards, and a card exports back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  await page.locator('#sakura-postman-file-input').setInputFiles({
    name: 'orders.postman_collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(COLLECTION))
  });

  await expect(page.locator('#header-title')).toHaveValue('Orders API');
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes.map((n: any) => [n.depth, n.text]))).toEqual([[0, 'Orders'], [1, 'Create order'], [0, 'Health']]);
  await expect(page.locator('.pv-api')).toHaveCount(2);
  await expect(page.locator('.pv-api').first().locator('.pv-api-url')).toHaveText('{{baseUrl}}/orders');
  await expect(page.locator('.pv-api').first().locator('.pv-api-status')).toHaveText('201 Created');
  // A multi-line body survives the table round trip.
  await expect(page.locator('.pv-api').first().locator('.pv-api-code').first()).toContainText('"id": "4711"');

  // Export is one request at a time, from the card (owner 2026-10-30).
  await page.locator('.pv-api').first().click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Export this request (.json)' }).click();
  const file = await (await download).path();
  const out = JSON.parse(readFileSync(file!, 'utf8'));
  expect(out.info.name).toBe('Create order');
  expect(out.item).toHaveLength(1);
  const create = out.item[0];
  expect(create.request.method).toBe('POST');
  expect(create.request.url.raw).toBe('{{baseUrl}}/orders');
  expect(create.request.body.raw).toBe('{\n  "id": "4711"\n}');
  expect(create.response[0]).toMatchObject({ code: 201, status: 'Created' });
  expect(errors).toEqual([]);
});

test('a file that is not a collection says so and creates nothing', async ({ page }) => {
  await page.goto('file://' + indexPath);
  // @ts-expect-error -- bare global from index.html
  const before = await page.evaluate(() => loadActiveDocsIndex().length);
  await page.locator('#sakura-postman-file-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('.toast, #toast, [role="status"]').filter({ hasText: 'Postman collection' }).first()).toBeVisible();
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => loadActiveDocsIndex().length)).toBe(before);
});

test('Import and Export menus offer Postman collection', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => ({
    exp: (window as any).exportMenuItems().map((i: any) => i.label),
    imp: (window as any).importMenuItems().map((i: any) => i.label)
  }));
  // Import is an entry point; exporting lives on the API cards, not the general export menus.
  expect(r.exp).not.toContain('Postman collection');
  expect(r.imp).toContain('Postman collection');
});

test('Postman export is only per card: not in Share, and no export-all', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  await page.locator('#sakura-postman-file-input').setInputFiles({
    name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(COLLECTION))
  });
  await expect(page.locator('.pv-api')).toHaveCount(2);
  await page.locator('#doc-share-chip').click();
  const labels = await page.locator('#share-menu .sb-context-item .sb-context-label').allTextContents();
  await page.keyboard.press('Escape');
  expect(labels.join('|')).not.toMatch(/Postman/);
  await page.locator('.pv-api').first().click({ button: 'right' });
  const items = await page.locator('.sb-context-menu .sb-context-item .sb-context-label').allTextContents();
  expect(items.some((t) => t.startsWith('Export this request (.json)'))).toBe(true);
  expect(items.join('|')).not.toMatch(/Export all/);
});


test('collection auth imports as a header with the secret replaced', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  const withAuth = { ...COLLECTION, auth: { type: 'bearer', bearer: [{ key: 'token', value: 'real-secret-123' }] } };
  await page.locator('#sakura-postman-file-input').setInputFiles({
    name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(withAuth))
  });
  // The collection's bearer token becomes a header, with the literal secret replaced by a variable.
  const authPair = page.locator('.pv-api').first().locator('.pv-api-pair', { hasText: 'Authorization' });
  await expect(authPair.locator('.pv-api-val')).toHaveText('Bearer {{token}}');
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => JSON.stringify(nodes))).not.toContain('real-secret-123');

});
