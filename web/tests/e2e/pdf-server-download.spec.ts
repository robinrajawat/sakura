import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-07: Download PDF saves a .pdf straight away when signed in (the Worker's POST /pdf
// prints the page's print copy in Cloudflare's Chrome). If the Worker fails, the print dialog
// opens instead, from a hidden copy of the PDF.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    let id = 1; const nodes: unknown[] = [];
    for (let i = 1; i <= 3; i++) {
      const p = id++; nodes.push({ id: p, depth: 0, text: 'Section ' + i, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
      nodes.push({ id: id++, depth: 1, text: 'Body of section ' + i, parentId: p, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
    }
    localStorage.setItem('sakura_doc_v1_srv', JSON.stringify({ nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Server PDF', author: '' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'srv', title: 'Server PDF', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', 'srv');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  // A stand-in signed-in user: only getIdToken is used on this path.
  await page.evaluate(() => {
    // eslint-disable-next-line no-eval
    (0, eval)("currentUser = { uid: 'u1', getIdToken: async () => 'token-1' }");
  });
});

test('signed in: the server makes the PDF and it downloads, no print dialog', async ({ page }) => {
  let sent: any = null;
  let auth = '';
  await page.route('https://ai.sakura-notes.com/pdf', async (route) => {
    sent = route.request().postDataJSON();
    auth = route.request().headers()['authorization'] || '';
    await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 test' });
  });
  await page.evaluate(() => { (window as any).print = () => { (window as any).__mainPrinted = true; }; });
  const download = page.waitForEvent('download');
  await page.evaluate(() => (window as any).exportPdfDirect());
  const d = await download;
  expect(d.suggestedFilename()).toBe('Server PDF.pdf');
  expect(auth).toBe('Bearer token-1');
  expect(sent.title).toBe('Server PDF');
  expect(sent.html).toContain('<base href="https://www.sakura-notes.com/">');
  expect(sent.html).toContain('Body of section 3');
  expect(sent.html).toContain('printing-preview');
  const state = await page.evaluate(() => ({
    mainPrinted: !!(window as any).__mainPrinted,
    frame: !!document.getElementById('sakura-print-frame'),
    restored: !document.body.classList.contains('printing-preview'),
  }));
  expect(state).toEqual({ mainPrinted: false, frame: false, restored: true });
  await expect(page.locator('#toast')).toContainText('PDF saved');
});

test('server fails: falls back to the print dialog from the hidden copy', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"Daily PDF limit reached"}' }));
  const r = await page.evaluate(() => new Promise<any>((resolve) => {
    new MutationObserver((_m, obs) => {
      const f = document.getElementById('sakura-print-frame') as HTMLIFrameElement | null;
      if (!f) return;
      obs.disconnect();
      (f.contentWindow as any).print = () => resolve({ text: f.contentDocument!.getElementById('preview-body')?.textContent || '' });
    }).observe(document.body, { childList: true });
    (window as any).exportPdfDirect();
  }));
  expect(r.text).toContain('Body of section 2');
});

test('signed out: prints the page as before, nothing sent', async ({ page }) => {
  let called = false;
  await page.route('https://ai.sakura-notes.com/pdf', (route) => { called = true; return route.abort(); });
  const printed = await page.evaluate(async () => {
    (0, eval)('currentUser = null');
    const w = window as any; let p = false; w.print = () => { p = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!p && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    window.dispatchEvent(new Event('afterprint'));
    return p;
  });
  expect(printed).toBe(true);
  expect(called).toBe(false);
});

test('server limit reached: says why, then opens print', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"Daily PDF limit reached"}' }));
  await page.evaluate(() => (window as any).exportPdfDirect());
  await expect(page.locator('#toast')).toContainText("Today's PDF limit is reached, opening print instead");
});

test('server error: the message names it, so a failure can be told apart without dev tools', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"error":"PDF rendering failed","details":["Browser time limit exceeded"]}' }));
  await page.evaluate(() => (window as any).exportPdfDirect());
  await expect(page.locator('#toast')).toContainText("Couldn't make the PDF file (error 502 \u2014 PDF rendering failed: Browser time limit exceeded), opening print instead");
});

test('no response (blocked or network down): the message says so', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', (route) => route.abort());
  await page.evaluate(() => (window as any).exportPdfDirect());
  await expect(page.locator('#toast')).toContainText("Couldn't make the PDF file (no response from the PDF service), opening print instead");
});

test('a second click while the PDF is being made does nothing', async ({ page }) => {
  let requests = 0;
  let release: () => void = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route('https://ai.sakura-notes.com/pdf', async (route) => {
    requests++;
    await held;
    await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 test' });
  });
  await page.evaluate(() => (window as any).exportPdfDirect());
  await expect(page.locator('#toast')).toContainText('Preparing PDF');
  await page.evaluate(() => (window as any).exportPdfDirect());
  const download = page.waitForEvent('download');
  release();
  await download;
  expect(requests).toBe(1);
});

test('while it is made: one message with a spinner and Cancel; Cancel stops it and opens no print dialog', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', () => { /* never answers */ });
  await page.evaluate(() => { const w = window as any; w.__printed = false; w.print = () => { w.__printed = true; }; w.exportPdfDirect(); });
  const toast = page.locator('#toast');
  await expect(toast).toContainText('Preparing PDF');
  await expect(toast.locator('.toast-spinner')).toHaveCount(1);
  await toast.locator('.toast-action-btn', { hasText: 'Cancel' }).click();
  await expect(toast).toContainText('PDF cancelled');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({ frame: !!document.getElementById('sakura-print-frame'), busy: (0, eval)('_serverPdfBusy') }))).toEqual({ frame: false, busy: false });
});

test('a slow PDF says it is still working after 10 seconds', async ({ page }) => {
  await page.clock.install();
  await page.route('https://ai.sakura-notes.com/pdf', () => { /* never answers */ });
  await page.evaluate(() => (window as any).exportPdfDirect());
  await expect(page.locator('#toast')).toContainText('Preparing PDF');
  await page.clock.runFor(10500);
  await expect(page.locator('#toast')).toContainText('Still preparing your PDF');
});

test('To-Dos PDF takes the same path and is named To-Dos.pdf', async ({ page }) => {
  await page.route('https://ai.sakura-notes.com/pdf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 test' }));
  const download = page.waitForEvent('download');
  await page.evaluate(() => (window as any).printHtmlAsPdf('To-Dos', 'To-Dos', '<div class="gpe-empty">(none)</div>'));
  expect((await download).suggestedFilename()).toBe('To-Dos.pdf');
  expect(await page.evaluate(() => !!document.getElementById('gpe-overlay'))).toBe(false);
});
