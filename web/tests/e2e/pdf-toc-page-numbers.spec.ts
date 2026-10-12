import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// PDF Contents page: each entry gets a dotted leader and a page number, measured before printing
// (Chrome can't print target-counter()). The cover page has no footer and isn't counted, so the
// footer's total is the measured page count minus the cover.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'pdftocdoc';
const LONG = '<table><tbody><tr><th>Ticket</th><th>Owner</th></tr>'
  + Array.from({ length: 60 }, (_, i) => `<tr><td>Ticket ${i}</td><td>Sam</td></tr>`).join('') + '</tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId, long }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      let id = 1; const nodes: unknown[] = [];
      const add = (depth: number, text: string, parentId: number | null, tables: string[] = []) => {
        nodes.push({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables, tags: [], styles: {} });
        return id++;
      };
      const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. '.repeat(4);
      ['Overview', 'Plan', 'Risks'].forEach((s, i) => {
        const a = add(0, '[' + s + ']', null);
        for (let j = 0; j < 8; j++) add(1, lorem, a);
        if (i === 0) add(1, 'Tickets', a, [long]);
      });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'TOC test', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'TOC test', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, long: LONG });
});

test('Contents entries carry measured page numbers; cover is unnumbered', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');

  const result = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
    const entries = [...document.querySelectorAll('#preview-toc .pv-toc-item')].map((a) => ({
      label: a.querySelector('.pv-toc-label')?.textContent || '',
      page: a.querySelector('.pv-toc-page')?.textContent || '',
      hasPage: a.classList.contains('has-page')
    }));
    const css = document.getElementById('pv-print-override')?.textContent || '';
    return {
      printed: w.__printed,
      entries,
      footer: (css.match(/@bottom-center\{[^}]*\}/) || [''])[0],
      coverRule: /@page cover/.test(css),
      coverNamed: /#sakura-cover-page\{[^}]*page:cover;/.test(css.replace(/\s+/g, '')),
      leftoverFrames: document.querySelectorAll('iframe[aria-hidden="true"]').length
    };
  });

  expect(result.printed).toBe(true);
  expect(result.entries.map((e) => e.label)).toEqual(['Overview', 'Plan', 'Risks']);
  for (const e of result.entries) {
    expect(e.hasPage).toBe(true);
    expect(e.page).toMatch(/^\d+$/);
  }
  const nums = result.entries.map((e) => Number(e.page));
  // Contents is page 1, so the first section starts on page 2; the long table pushes the rest on.
  expect(nums[0]).toBe(2);
  expect(nums[1]).toBeGreaterThan(nums[0] + 1);
  expect(nums[2]).toBeGreaterThanOrEqual(nums[1]);
  // The footer total is a measured literal (cover excluded), not counter(pages).
  expect(result.footer).toMatch(/" of " "\d+"/);
  expect(Number(result.footer.match(/" of " "(\d+)"/)![1])).toBeGreaterThanOrEqual(nums[2]);
  expect(result.coverRule).toBe(true);
  expect(result.coverNamed).toBe(true);
  expect(result.leftoverFrames).toBe(0);
  expect(errors).toEqual([]);
});
