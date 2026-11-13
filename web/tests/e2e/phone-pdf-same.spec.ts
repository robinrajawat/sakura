import { test, expect, devices, type Browser, type BrowserContextOptions } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 1: Download PDF from a phone gives the same file as from a computer.
// The print copy carries html.phone and every stylesheet, so this exports the same document from a
// phone-sized screen and a desktop one, renders both copies as print the way the Worker does, and
// requires identical pixels.
const row = (id: number, depth: number, text: string, parentId: number | null, extra = {}) =>
  ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...extra });
const NODES = [
  row(1, 0, 'Quarter goals', null, { styles: { heading: 1 } }),
  row(2, 1, 'Ship the phone layout without touching the desktop', 1, { note: '<p>One app, one URL.</p>',
    tables: ['<table><thead><tr><th>Owner</th><th>Status</th></tr></thead><tbody><tr><td>Sam</td><td>Open</td></tr></tbody></table>'] }),
  row(3, 1, 'Checked item', 1, { isCheckbox: true, checked: true }),
  row(4, 0, 'Notes', null, { styles: { heading: 2 } }),
  row(5, 1, 'A plain row with **bold** words', 4)
];

async function printCopy(browser: Browser, opts: BrowserContextOptions, query: string): Promise<string> {
  const ctx = await browser.newContext(opts);
  try {
    const page = await ctx.newPage();
    await page.addInitScript((nodes) => {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      localStorage.setItem('sakura_doc_v1_pdf', JSON.stringify({ nodes, nextId: 6, collapsed: [], title: 'Same PDF', author: 'Robin' }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'pdf', title: 'Same PDF', updatedAt: 1767225600000 }]));
      localStorage.setItem('sakura_current_doc_v1', 'pdf');
    }, NODES);
    let html = '';
    await page.route('https://ai.sakura-notes.com/pdf', async (route) => {
      html = route.request().postDataJSON().html;
      await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 test' });
    });
    await page.goto('file://' + indexPath + query);
    await page.waitForFunction(() => typeof (window as unknown as { exportPdfDirect?: unknown }).exportPdfDirect === 'function');
    // lastSavedAt pinned: the cover's "Updated …" comes from the last autosave, and under load one
    // copy could be exported before its first autosave and the other after.
    await page.evaluate(() => (0, eval)("currentUser = { uid: 'u1', getIdToken: async () => 'token-1' }; lastSavedAt = 1767225600000; exportPdfDirect()"));
    await expect.poll(() => html.length, { timeout: 20000 }).toBeGreaterThan(0);
    return html;
  } finally {
    await ctx.close();
  }
}

async function renderAsPrint(browser: Browser, html: string): Promise<Buffer> {
  // 700px: about an A4 page's printable width once margins are off, under the phone breakpoint, so
  // a phone rule that wasn't kept off print would show here.
  const p = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 700, height: 1200 } });
  await p.emulateMedia({ media: 'print' });
  // Refused outright, not left to time out, so fonts settle the same way in both renders.
  await p.route(/^https?:/, (route) => route.abort());
  await p.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch(() => undefined);
  await p.evaluate(() => document.fonts.ready).catch(() => undefined);
  // Settled: two shots in a row the same (pictures can finish decoding after 'load' under load).
  let shot = await p.screenshot({ fullPage: true });
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(100);
    const next = await p.screenshot({ fullPage: true });
    if (next.equals(shot)) break;
    shot = next;
  }
  await p.close();
  return shot;
}

test('a PDF made on a phone looks the same as one made on a computer', async ({ browser }) => {
  test.setTimeout(90000);
  const desktop = await printCopy(browser, { viewport: { width: 1280, height: 800 } }, '');
  const iphone: BrowserContextOptions & { defaultBrowserType?: string } = { ...devices['iPhone 13'] };
  delete iphone.defaultBrowserType;
  const phone = await printCopy(browser, iphone, '');
  expect(phone).toMatch(/<html class="[^"]*\bphone\b/);
  const a = await renderAsPrint(browser, desktop);
  const b = await renderAsPrint(browser, phone);
  if (!b.equals(a)) {
    const { writeFileSync } = await import('fs');
    writeFileSync(test.info().outputPath('desktop.png'), a);
    writeFileSync(test.info().outputPath('phone.png'), b);
    writeFileSync(test.info().outputPath('desktop.html'), desktop);
    writeFileSync(test.info().outputPath('phone.html'), phone);
  }
  expect(b.equals(a)).toBe(true);
});
