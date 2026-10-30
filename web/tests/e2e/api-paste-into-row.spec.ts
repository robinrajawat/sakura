import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// API requests come in one at a time (owner 2026-10-30): a cURL command pasted into a row adds an
// API request card to that row. No collection import, and Postman export is per card only.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const CURL = "curl --location 'https://erp.example.com/sap/opu/odata/sap/ZSD_SHIPPING_SRV/PostalCodeSet?$format=json' \\\n"
  + "--header 'Content-Type: application/json' \\\n"
  + "--header 'Authorization: Bearer real-secret-123' \\\n"
  + "--data '{\"Country\":\"DK\",\"PostalCode\":\"2300\"}'";

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`document.getElementById('sakura-landing-overlay')?.style.setProperty('display','none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
    ensureDocumentForEditing();
    const n=(id,text)=>({id,depth:0,text,parentId:null,isCheckbox:false,checked:false,note:'',tables:[],images:[],tags:[],styles:{}});
    nodes=[n(1,''),n(2,'Postal Code Lookup')]; rebuildParentIds(); nextId=3; editingId=null; render();`);
  return errors;
}

async function paste(page: Page, target: string, text: string) {
  await page.evaluate(({ target, text }) => {
    const dt = new DataTransfer(); dt.setData('text/plain', text);
    const el = target === 'editing' ? (window as any).getEditingInput() : document.body;
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { target, text });
}

test('a cURL pasted into an empty row becomes an API card, named after the call; one undo removes it', async ({ page }) => {
  const errors = await open(page);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => beginEditAt(1, 0));
  await paste(page, 'editing', CURL);
  const card = page.locator('.pv-api');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.pv-api-method')).toHaveText('POST');
  await expect(card.locator('.pv-api-url')).toHaveText('https://erp.example.com/sap/opu/odata/sap/ZSD_SHIPPING_SRV/PostalCodeSet?$format=json');
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].text)).toBe('POST PostalCodeSet');
  // The literal token never reaches the document.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => JSON.stringify(nodes))).not.toContain('real-secret-123');
  await expect(card.locator('.pv-api-pair', { hasText: 'Authorization' }).locator('.pv-api-val')).toHaveText('Bearer {{token}}');

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.pv-api')).toHaveCount(0);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].text)).toBe('');
  expect(errors).toEqual([]);
});

test('pasting onto a selected row keeps its name; ordinary text still pastes as text', async ({ page }) => {
  await open(page);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => { setSingleSelection(2); render(); });
  await paste(page, 'body', "curl 'https://a.example/health'");
  await expect(page.locator('.pv-api')).toHaveCount(1);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => [nodes[1].text, nodes[1].tables.length])).toEqual(['Postal Code Lookup', 1]);

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => beginEditAt(1, 0));
  await paste(page, 'editing', 'curling is a sport');
  await expect(page.locator('.pv-api')).toHaveCount(1);
});

test('the card exports just its request as a Postman file; no Postman import or export in the menus', async ({ page }) => {
  await open(page);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => { setSingleSelection(2); render(); });
  await paste(page, 'body', CURL);
  await page.locator('.pv-api').click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Export this request (.json)' }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toBe('Postal Code Lookup.postman_collection.json');
  const out = JSON.parse(readFileSync((await dl.path())!, 'utf8'));
  expect(out.info.name).toBe('Postal Code Lookup');
  expect(out.item).toHaveLength(1);
  expect(out.item[0].request.method).toBe('POST');
  expect(out.item[0].request.body.raw).toBe('{"Country":"DK","PostalCode":"2300"}');

  const menus = await page.evaluate(() => ({
    exp: (window as any).exportMenuItems().map((i: any) => i.label),
    imp: (window as any).importMenuItems().map((i: any) => i.label),
    explorer: (window as any).explorerContextItems().map((i: any) => i.label || '')
  }));
  expect([...menus.exp, ...menus.imp, ...menus.explorer].join('|')).not.toMatch(/Postman/);
  expect(await page.locator('#sakura-postman-file-input').count()).toBe(0);
});
