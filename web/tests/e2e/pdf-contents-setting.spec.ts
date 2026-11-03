import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-03: the PDF layout follows the settings, never the document's length. Cover and
// Contents are two switches; without a cover, Contents sits under the title at any length (it used
// to move to its own page past 8 entries). "min read" is gone from the PDF (a screen convention).
const DOC_ID = 'pdfcontentsset';
const SECTIONS = Array.from({ length: 14 }, (_, i) => 'Section ' + (i + 1));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, sections }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      let id = 1; const nodes: unknown[] = [];
      for (const s of sections) {
        const p = id++; nodes.push({ id: p, depth: 0, text: s, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
        nodes.push({ id: id++, depth: 1, text: 'Body of ' + s, parentId: p, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
      }
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({ nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Settings test', author: '' }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Settings test', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, sections: SECTIONS });
});

async function exportWith(page: import('@playwright/test').Page, cover: boolean, contents: boolean) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  return page.evaluate(async ({ cover, contents }) => {
    const w = window as any;
    w.setCoverPageEnabled(cover, false);
    w.setContentsPageEnabled(contents, false);
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
    const toc = document.getElementById('preview-toc')!;
    const res = {
      printed: w.__printed,
      tocShown: !toc.classList.contains('pv-toc-hidden-auto'),
      tocInline: toc.classList.contains('pv-toc-inline'),
      pages: [...toc.querySelectorAll('.pv-toc-page')].map((p) => p.textContent || ''),
      meta: (document.getElementById('sakura-cover-meta')?.textContent || '') + ' | ' + (document.getElementById('pv-doc-meta')?.textContent || '')
    };
    window.dispatchEvent(new Event('afterprint'));
    return res;
  }, { cover, contents });
}

test('cover on, Contents on: Contents has its own page; numbers count the cover and Contents', async ({ page }) => {
  const r = await exportWith(page, true, true);
  expect(r.printed).toBe(true);
  expect(r.tocShown).toBe(true);
  expect(r.tocInline).toBe(false);
  expect(r.pages[0]).toBe('3');
  expect(r.meta).not.toContain('min read');
});

test('cover off, Contents on: Contents sits under the title even with 14 entries', async ({ page }) => {
  const r = await exportWith(page, false, true);
  expect(r.tocShown).toBe(true);
  expect(r.tocInline).toBe(true);
  expect(r.pages).toHaveLength(14);
  expect(r.pages[0]).toBe('1');
  expect(r.pages.every((p) => /^\d+$/.test(p))).toBe(true);
  expect(r.meta).not.toContain('min read');
});

test('Contents off: no Contents with or without a cover', async ({ page }) => {
  const a = await exportWith(page, true, false);
  expect(a.printed).toBe(true);
  expect(a.tocShown).toBe(false);
  const b = await exportWith(page, false, false);
  expect(b.tocShown).toBe(false);
});

test('Settings has a Contents switch next to Cover page, on by default', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  const t = page.locator('#contents-page-toggle');
  await expect(t).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.settings-list-row:has(#cover-page-toggle) + .settings-list-row #contents-page-toggle')).toHaveCount(1);
});
