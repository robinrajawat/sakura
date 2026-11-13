import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Download PDF's server copy carries only the CSS the printed page can use (trimPrintCopyCss,
// src/utils/cssTrim.ts), so a slow upload (a phone hotspot) is much shorter. The owner's condition
// (2026-11-13): the PDF must not change. This renders a rich document's print copy with all the
// app's CSS and with the trimmed CSS, as print, and requires identical pixels.
const IMG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#9ab"/><circle cx="30" cy="30" r="20" fill="#e63"/></svg>').toString('base64');
const T = (attrs: string, rows: string[][]) =>
  `<table ${attrs}><thead><tr>${rows[0].map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
  rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
const TABLES = [
  T('', [['Owner', 'Status', 'Due'], ['Sam', 'Open', '2026-12-01'], ['Ana', 'Done', '2026-11-20']]),
  T('data-feature-chart="1" data-chart-type="bar"', [['Region', 'Sales'], ['North', '120'], ['South', '80'], ['West', '45']]),
  T('data-feature-chart="1" data-chart-type="cards"', [['Metric', 'Value'], ['Users', '1,200'], ['Uptime', '99.9%'], ['Latency', '120 ms']]),
  T('data-table-display="chips"', [['Tag'], ['ERP'], ['EWM'], ['TM']]),
  T('data-table-display="timeline"', [['Milestone', 'Date'], ['Design', '2026-11-01'], ['Build', '2026-12-01'], ['Launch', '2027-01-15']]),
  T('data-table-display="board"', [['Task', 'Status'], ['Spec', 'Done'], ['API', 'In progress'], ['Docs', 'To do']]),
  T('data-table-display="progress"', [['Stream', 'Progress'], ['Data', '40%'], ['UI', '75%']]),
  T('data-table-display="proscons"', [['Pros', 'Cons'], ['Fast', 'Costly'], ['Simple', 'New']]),
  T('data-table-display="api"', [['Field', 'Value'], ['Method', 'GET'], ['URL', 'https://api.example.com/v1/items'], ['Header', 'Accept: application/json']])
];

async function printCopy(page: Page, fullCss: boolean): Promise<string> {
  let html = '';
  await page.unroute('https://ai.sakura-notes.com/pdf');
  await page.route('https://ai.sakura-notes.com/pdf', async (route) => {
    html = route.request().postDataJSON().html;
    await route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'Access-Control-Allow-Origin': '*' }, body: '%PDF-1.7 test' });
  });
  await page.evaluate((full) => {
    (window as unknown as { __sakuraPdfFullCss: boolean }).__sakuraPdfFullCss = full;
    (window as unknown as { exportPdfDirect: () => void }).exportPdfDirect();
  }, fullCss);
  await expect.poll(() => html.length, { timeout: 20000 }).toBeGreaterThan(0);
  // Finished (a second export is ignored while one is busy).
  // eslint-disable-next-line no-eval
  await expect.poll(() => page.evaluate(() => (0, eval)('_serverPdfBusy'))).toBe(false);
  return html;
}

async function renderAsPrint(page: Page, html: string): Promise<Buffer> {
  const ctx = page.context();
  const p = await ctx.browser()!.newPage({ javaScriptEnabled: false, viewport: { width: 900, height: 1200 } });
  await p.emulateMedia({ media: 'print' });
  // Same as the Worker, minus the network: the <base> points at the live site, unreachable here,
  // so both copies render with the same fallback fonts. Requests are refused outright rather than
  // left to time out: under full-suite load a font still pending when the shot was taken left one
  // copy's text hidden (font block period) and the two renders differed.
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

test('the trimmed print copy is a fraction of the size and renders identically', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(({ tables, img }) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    let id = 1;
    const nodes: unknown[] = [];
    const n = (depth: number, text: string, parentId: number | null, extra = {}) => {
      const node = { id: id++, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...extra };
      nodes.push(node); return node.id;
    };
    const s1 = n(0, '[Plan] Quarter goals', null, { styles: { heading: 1 } });
    n(1, 'Ship cloud-first sync', s1, { note: '<p>Safe writes first, then the rest.</p>', tables: [tables[0], tables[1]] });
    n(1, 'Checked item', s1, { isCheckbox: true, checked: true });
    n(1, 'Open item', s1, { isCheckbox: true });
    const s2 = n(0, 'Metrics and status', null, { styles: { heading: 2 } });
    n(1, 'Numbers', s2, { tables: [tables[2], tables[3], tables[4]] });
    n(1, 'Work', s2, { tables: [tables[5], tables[6], tables[7], tables[8]] });
    const s3 = n(0, 'Pictures', null, { styles: { heading: 3 } });
    n(1, 'Screenshot with a caption', s3, { images: [{ id: 'im1', src: img, caption: 'The dashboard', annotations: [], createdAt: 1 }] });
    n(1, 'A plain row with **words** and #tag', s3);
    localStorage.setItem('sakura_doc_v1_trim', JSON.stringify({ nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Trim check', author: 'Robin', docStatus: 'review' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'trim', title: 'Trim check', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', 'trim');
  }, { tables: TABLES, img: IMG });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { exportPdfDirect?: unknown }).exportPdfDirect === 'function');
  await page.evaluate(() => {
    // eslint-disable-next-line no-eval
    (0, eval)("currentUser = { uid: 'u1', getIdToken: async () => 'token-1' }");
  });

  // One export with all the CSS; the trimmed copy is made from that same page.
  const full = await printCopy(page, true);
  const trimmed = await page.evaluate((h) => {
    (window as unknown as { __sakuraPdfFullCss: boolean }).__sakuraPdfFullCss = false;
    // @ts-expect-error -- bare global from index.html
    return trimPrintCopyCss(h) as string;
  }, full);
  expect(trimmed.length).toBeLessThan(full.length / 3);
  expect(trimmed.slice(trimmed.indexOf('</style></head>'))).toBe(full.slice(full.indexOf('</style></head>')));

  const a = await renderAsPrint(page, full);
  const b = await renderAsPrint(page, trimmed);
  expect(b.equals(a)).toBe(true);
});
