import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// PDF layout: a node's note prints right under it, before its tables and images; with a cover the
// title block isn't repeated on the first body page and Contents keeps its own page; without a
// cover, a short Contents list (up to 8 entries) sits under the title instead.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'pdflayoutdoc';
const TABLE = '<table><thead><tr><th>Owner</th><th>Status</th></tr></thead><tbody><tr><td>Sam</td><td>Open</td></tr></tbody></table>';
const IMG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#9ab"/></svg>').toString('base64');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, table, img }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const n = (id: number, depth: number, text: string, parentId: number | null, extra = {}) =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...extra });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          n(1, 0, '[Plan]', null),
          n(2, 1, 'Workstreams', 1, {
            note: '<p>First line of the note.</p><p>Second line.</p>', tables: [table],
            images: [{ id: 'im1', src: img, caption: 'Shot', annotations: [], createdAt: 1 }]
          }),
          n(3, 0, '[Risks]', null)
        ],
        nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Layout', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Layout', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, table: TABLE, img: IMG });
});

async function exportPdf(page: import('@playwright/test').Page, cover: boolean) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  const r = await page.evaluate(async (cover) => {
    const w = window as any;
    w.coverPageEnabled = cover;
    // @ts-expect-error -- bare global from index.html
    coverPageEnabled = cover;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const docEl = document.getElementById('preview-doc')!;
    const order = [...docEl.querySelectorAll('.pv-inline-block, .pv-table-row, .pv-node-images')].map((e) =>
      e.classList.contains('pv-inline-block') ? 'note' : e.classList.contains('pv-table-row') ? 'table' : 'images');
    const toc = document.getElementById('preview-toc')!;
    const css = document.getElementById('pv-print-override')?.textContent || '';
    const res = {
      printed: w.__printed, order,
      tocInline: toc.classList.contains('pv-toc-inline'),
      tocParent: toc.parentElement?.id || '',
      tocPrev: toc.previousElementSibling?.id || '',
      pages: [...toc.querySelectorAll('.pv-toc-page')].map((p) => p.textContent),
      headerHiddenRule: css.includes('has-cover-page #pv-doc-header{ display:none')
    };
    // Cleanup (afterprint) puts Contents back in its own slot.
    window.dispatchEvent(new Event('afterprint'));
    return { ...res, homeParent: toc.parentElement?.id || '', homeNext: toc.nextElementSibling?.id || '', inlineAfter: toc.classList.contains('pv-toc-inline') };
  }, cover);
  return { r, errors };
}

test('with a cover: note before table and images, Contents on its own page, no repeated title', async ({ page }) => {
  const { r, errors } = await exportPdf(page, true);
  expect(r.printed).toBe(true);
  expect(r.order).toEqual(['note', 'table', 'images']);
  expect(r.tocInline).toBe(false);
  expect(r.tocParent).toBe('preview-main');
  expect(r.pages).toEqual(['2', '2']); // Contents is page 1; both short sections fit page 2
  expect(r.headerHiddenRule).toBe(true);
  expect(r.homeParent).toBe('preview-main');
  expect(r.homeNext).toBe('preview-body');
  expect(r.inlineAfter).toBe(false);
  expect(errors).toEqual([]);
});

test('without a cover: Contents sits right under the title', async ({ page }) => {
  const { r, errors } = await exportPdf(page, false);
  expect(r.tocInline).toBe(true);
  expect(r.tocPrev).toBe('pv-doc-header');
  expect(r.pages.every((p) => /^\d+$/.test(p || ''))).toBe(true);
  expect(r.homeParent).toBe('preview-main');
  expect(errors).toEqual([]);
});

test('editorial cover: title, sections line and a details block with author, date, status and length', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  const r = await page.evaluate(async () => {
    const w = window as any;
    // @ts-expect-error -- bare globals from index.html
    nodes[0].text = '[Release 2.4] Plan'; setDocStatus('review', false);
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const cover = document.getElementById('sakura-cover-page')!;
    return {
      title: cover.querySelector('#sakura-cover-title')?.textContent,
      subtitle: cover.querySelector('#sakura-cover-subtitle')?.textContent,
      labels: [...cover.querySelectorAll('.sakura-cover-dt')].map((e) => e.textContent),
      status: cover.querySelector('.sakura-cover-dd.status-review')?.textContent,
      stamp: cover.querySelectorAll('.pv-status-stamp').length
    };
  });
  expect(r.title).toBe('Layout');
  expect(r.subtitle).toBe('Release 2.4 · Plan · Risks');
  expect(r.labels).toEqual(expect.arrayContaining(['Date', 'Status', 'Length']));
  expect(r.status).toBe('Review');
  expect(r.stamp).toBe(0); // status is a details row now, not a rotated stamp
});
