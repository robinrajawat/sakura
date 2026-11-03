import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-03: a heading on a top-level row made no difference in the PDF (every top-level
// row printed as the same small section line), and a long document title squeezed the footer's
// centred "Page x of y" onto two lines.
const DOC_ID = 'pdfheadfoot';
const TITLE = 'Kumla WH — Reduce broken pallets in AGV area with a much longer title than fits';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, title }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      const mk = (id: number, depth: number, text: string, heading = 0) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: heading ? { heading } : {} });
      const nodes = [mk(1, 0, 'Plain top row'), mk(2, 1, 'child'), mk(3, 0, 'Top heading', 1), mk(4, 1, 'child'), mk(5, 1, 'Nested heading', 2)];
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({ nodes, nextId: 6, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title, author: '' }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title, updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, title: TITLE });
});

test('PDF: a top-level heading prints as that heading; the footer is two one-line boxes', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const css = document.getElementById('pv-print-override')?.textContent || '';
    return {
      plainIsSection: !!document.querySelector('#pv-anchor-1 .pv-section'),
      topHeading: !!document.querySelector('#pv-anchor-3 .pv-heading-1'),
      topHeadingSection: !!document.querySelector('#pv-anchor-3 .pv-section'),
      nestedHeading: !!document.querySelector('#pv-anchor-5 .pv-heading-2'),
      left: (css.match(/@bottom-left\{[^}]*\}/) || [''])[0],
      right: (css.match(/@bottom-right\{[^}]*\}/) || [''])[0],
      hasCenter: /@bottom-center\{\s*content:"Page/.test(css)
    };
  });
  expect(r.plainIsSection).toBe(true);
  expect(r.topHeading).toBe(true);
  expect(r.topHeadingSection).toBe(false);
  expect(r.nestedHeading).toBe(true);
  expect(r.hasCenter).toBe(false);
  expect(r.left).toContain('white-space:nowrap');
  expect(r.left).toContain('…');
  expect(r.right).toContain('Page " counter(page) " of " counter(pages)');
  expect(r.right).toContain('white-space:nowrap');
});

test('Help: the search box is always shown, with no search toggle beside the close X', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  await page.evaluate(() => document.getElementById('help-toggle')!.click());
  await expect(page.locator('#help-search')).toBeVisible();
  await expect(page.locator('#help-search-toggle-btn')).toBeHidden();
  await expect(page.locator('#help-close-btn')).toBeVisible();
});
