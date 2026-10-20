import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: an "Open items page" toggle (Settings › Export & copy, off by default) adds a
// page after the Contents listing follow-ups and open questions, each with the page it's on.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const DOC_ID = 'pdfoidoc';

async function setup(page: import('@playwright/test').Page, on: boolean) {
  await page.addInitScript(({ docId, on }) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    if (on) localStorage.setItem('sakura_v001_prefs', JSON.stringify({ openItemsPageEnabled: true }));
    let id = 1; const nodes: unknown[] = [];
    const add = (depth: number, text: string, parentId: number | null, x: object = {}) => { nodes.push({ id, depth, text, parentId, note: '', tables: [], tags: [], styles: {}, ...x }); return id++; };
    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor. '.repeat(4);
    ['Overview', 'Plan', 'Risks', 'Budget', 'Team', 'Timeline', 'Scope', 'Vendors', 'Support', 'Appendix'].forEach((s) => {
      const a = add(0, '[' + s + ']', null);
      for (let j = 0; j < 8; j++) add(1, lorem, a);
    });
    const fu = add(1, 'Export (ZOR)', 73, { marker: 'followup' }); // at the end, under Appendix
    const hidden = add(1, 'Secret row', 73, { marker: 'followup', noExport: true });
    const q = add(1, 'Customer comms', 73);
    const remarks = [
      { id: 'f1', anchorNodeId: fu, text: 'Check the CSV', person: 'Ana', status: 'followup', owner: 'Ben', createdAt: Date.now() - 3 * 864e5 },
      { id: 'f2', anchorNodeId: hidden, text: 'Hidden', status: 'followup', createdAt: Date.now() },
      { id: 'q1', anchorNodeId: q, text: 'Who signs off?', type: 'question', person: 'Maria', createdAt: Date.now() }
    ];
    localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({ nodes, nextId: id, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Launch plan', author: '', remarks }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Launch plan', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', docId);
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
  }, { docId: DOC_ID, on });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  return page.evaluate(async () => {
    const w = window as any;
    w.__printed = null;
    w.print = () => {
      const p = document.getElementById('pv-open-items');
      const toc = document.getElementById('preview-toc');
      w.__printed = p ? {
        text: p.innerText,
        items: [...p.querySelectorAll('.pv-oi-item')].map((a) => ({ href: a.getAttribute('href'), page: a.querySelector('.pv-toc-page')?.textContent || '' })),
        afterToc: !!toc && toc.nextElementSibling === p,
        tocPages: [...document.querySelectorAll('#preview-toc .pv-toc-page')].map((x) => Number(x.textContent))
      } : 'none';
    };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new Event('afterprint'));
    return { result: w.__printed, leftover: !!document.getElementById('pv-open-items') };
  });
}

test('with the toggle on, an Open items page follows the Contents, each item with its page', async ({ page }) => {
  const { result, leftover } = await setup(page, true);
  expect(result).not.toBe('none');
  expect(result.afterToc).toBe(true);
  expect(result.text).toContain('Open items');
  expect(result.text).toContain('Export (ZOR)');
  expect(result.text).toContain('Who signs off?');
  expect(result.text).not.toContain('Secret row'); // left out of export
  expect(result.items.length).toBe(2);
  for (const it of result.items) expect(it.page).toMatch(/^\d+$/);
  // Both rows come after the last section (Appendix), so they print on its page or later.
  for (const it of result.items) expect(Number(it.page)).toBeGreaterThanOrEqual(result.tocPages[9]);
  expect(leftover).toBe(false); // removed after printing
});

test('off by default: no Open items page', async ({ page }) => {
  const { result } = await setup(page, false);
  expect(result).toBe('none');
});

test('the toggle sits in Settings › Export & copy and is remembered', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); });
  await page.goto('file://' + indexPath);
  const t = page.locator('#open-items-page-toggle');
  await expect(t).toHaveAttribute('aria-checked', 'false');
  await t.evaluate((b) => (b as HTMLElement).click());
  await expect(t).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}').openItemsPageEnabled)).toBe(true);
});
