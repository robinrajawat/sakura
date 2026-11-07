import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner bug 2026-11-04: Safari holds window.print() while the page has a request open (a signed-in
// page always has the sync connection), so Download PDF did nothing, and when the dialog came at
// last the screen had been put back. In Safari the PDF prints from a hidden copy in an iframe.
// window.__sakuraPrintViaFrame forces that path here, in Chromium.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    let id = 1; const nodes: unknown[] = [];
    for (let i = 1; i <= 4; i++) {
      const p = id++; nodes.push({ id: p, depth: 0, text: 'Section ' + i, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
      nodes.push({ id: id++, depth: 1, text: 'Body of section ' + i, parentId: p, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
    }
    localStorage.setItem('sakura_doc_v1_safari', JSON.stringify({ nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Safari print', author: '' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'safari', title: 'Safari print', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', 'safari');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
});

test('Safari path: the hidden copy prints the whole document and the page is put back', async ({ page }) => {
  const r = await page.evaluate(() => new Promise<any>((resolve) => {
    const w = window as any;
    w.__sakuraPrintViaFrame = true;
    let mainPrinted = false;
    w.print = () => { mainPrinted = true; };
    new MutationObserver((_m, obs) => {
      const f = document.getElementById('sakura-print-frame') as HTMLIFrameElement | null;
      if (!f) return;
      obs.disconnect();
      (f.contentWindow as any).print = () => {
        const d = f.contentDocument!;
        setTimeout(() => resolve({
          mainPrinted,
          title: d.title,
          text: d.getElementById('preview-body')?.textContent || '',
          hasStyles: d.querySelectorAll('style').length > 0,
          bodyPrinting: d.body.classList.contains('printing-preview'),
          pageRestored: !document.body.classList.contains('printing-preview'),
        }), 50);
      };
    }).observe(document.body, { childList: true });
    w.exportPdfDirect();
  }));
  expect(r.mainPrinted).toBe(false);
  expect(r.title).toContain('Safari print');
  for (let i = 1; i <= 4; i++) expect(r.text).toContain('Body of section ' + i);
  expect(r.hasStyles).toBe(true);
  expect(r.bodyPrinting).toBe(true);
  expect(r.pageRestored).toBe(true);
});

test('Chrome path: prints the page itself, no frame', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as any;
    let printed = false;
    w.print = () => { printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const frame = !!document.getElementById('sakura-print-frame');
    window.dispatchEvent(new Event('afterprint'));
    return { printed, frame };
  });
  expect(r).toEqual({ printed: true, frame: false });
});
