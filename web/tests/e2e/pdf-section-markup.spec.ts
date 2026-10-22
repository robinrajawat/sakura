import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-10-22: a section heading's name printed its markup as typed in the PDF
// ("[[Route Determination]]", "**bold**"), and the Contents page kept the ** and __.
const DOC_ID = 'pdfsecmarkup';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      const nodes = [
        { id: 1, depth: 0, text: '[Plan] See [[Route Determination]] for **bold** and __italic__ words', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Body row', parentId: 1, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} },
        { id: 3, depth: 0, text: 'Route Determination', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} }
      ];
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes, nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Markup test', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Markup test', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID });
});

test('PDF section names render bold, italic and [[links]] (old typed markup converted to formatting); Contents shows plain words', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const sec = document.querySelector('#pv-anchor-1 .pv-section-text') as HTMLElement;
    return {
      text: sec.textContent,
      bold: sec.querySelector('b')?.textContent,
      italic: sec.querySelector('i')?.textContent,
      toc: [...document.querySelectorAll('#preview-toc .pv-toc-label')].map((e) => e.textContent)
    };
  });
  expect(r.text).toBe('Plan · See Route Determination for bold and italic words');
  expect(r.bold).toBe('bold');
  expect(r.italic).toBe('italic');
  expect(r.toc[0]).toBe('Plan · See Route Determination for bold and italic words');
});
