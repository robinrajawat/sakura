import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// 2026-11-03: a document's stored HTML (a table, a note) could carry an image whose onerror ran
// script when the document opened or printed. Documents can come from another account (Send a
// copy), a file (OPML import) or sync, so every note and table is cleaned (DOMPurify) when it is
// loaded or imported, and the cleaner keeps the formatting Sakura itself writes.
const BAD = '<img src="x:nope" onerror="window.__ran=(window.__ran||0)+1">';
const SVG_LINK = '<svg><a xlink:href="javascript:window.__ran=99"><text>t</text></a></svg>';

function seed(page: import('@playwright/test').Page) {
  return page.addInitScript(({ bad, svgLink }) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, extra: Record<string, unknown>) => ({ id, depth: 0, text: 'Row ' + id, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...extra });
    const doc = {
      nodes: [
        n(1, { tables: ['<table><tbody><tr><td>a' + bad + '</td><td>b</td></tr></tbody></table>'] }),
        n(2, { note: '<p>note</p>' + bad + svgLink }),
        n(3, { note: '<p><b>Bold</b> <span style="color:var(--fc-red)">red</span> <a href="https://example.com" target="_blank">site</a> <a href="javascript:alert(1)">bad</a></p><ul data-kind="x"><li>item</li></ul>' })
      ],
      nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Clean', author: '',
      remarks: [{ id: 'r1', anchorNodeId: 1, person: 'Sam', text: '<p>entry</p>' + bad, context: '', createdAt: 1 }]
    };
    localStorage.setItem('sakura_doc_v1_clean', JSON.stringify(doc));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'clean', title: 'Clean', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', 'clean');
  }, { bad: BAD, svgLink: SVG_LINK });
}

test('a loaded document runs no script from its tables, notes or threads, on screen or in the PDF', async ({ page }) => {
  await seed(page);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__ran || 0)).toBe(0);
  await page.evaluate(async () => {
    const w = window as any; w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 50));
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__ran || 0)).toBe(0);
  // The stored HTML itself is clean once loaded: no handlers, no javascript: links.
  // @ts-expect-error -- bare global from index.html
  const stored = await page.evaluate(() => nodes.map((x: { note: string; tables: string[] }) => x.note + x.tables.join('')).join('\n'));
  expect(stored).not.toMatch(/onerror|javascript:/i);
});

test('cleaning keeps Sakura formatting: bold, colours, lists, data attributes; new-tab links get noopener', async ({ page }) => {
  await seed(page);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).exportPdfDirect === 'function');
  // @ts-expect-error -- bare global from index.html
  const note = await page.evaluate(() => nodes.find((x: { id: number }) => x.id === 3).note as string);
  expect(note).toContain('<b>Bold</b>');
  expect(note).toContain('var(--fc-red)');
  expect(note).toContain('data-kind="x"');
  expect(note).toContain('<li>item</li>');
  expect(note).toMatch(/href="https:\/\/example\.com"[^>]*target="_blank"|target="_blank"[^>]*href="https:\/\/example\.com"/);
  expect(note).toContain('rel="noopener noreferrer"');
  expect(note).not.toContain('javascript:');
});

test('an imported OPML file is cleaned before its rows render', async ({ page }) => {
  await seed(page);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as any).importOpmlText === 'function');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const opml = `<?xml version="1.0"?><opml version="2.0"><head><title>T</title></head><body><outline text="A" _note="${esc('<p>n</p>' + BAD)}"/></body></opml>`;
  await page.evaluate((x) => (window as any).importOpmlText(x), opml);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__ran || 0)).toBe(0);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes.map((x: { note: string }) => x.note).join(''))).not.toMatch(/onerror/i);
});
