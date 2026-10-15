import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner (2026-10-15): a row's inline objects come in one order, in the outline and the PDF —
// note → tables → images → diagrams → thread: the row's content first, then what people said.

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('outline and PDF: note, tables, images, diagrams, then the thread', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 1200 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    nodes = [{ id: 1, depth: 0, text: 'Cutover', parentId: null, isCheckbox: false, checked: false, note: 'A note.',
      tables: ['<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>1</td></tr></tbody></table>'],
      images: [{ id: 'i1', src: '${IMG}', caption: 'Pic', annotations: [], createdAt: 1 }], tags: [], styles: {} }];
    nextId = 2;
    remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'A comment.', createdAt: 1 }];
    diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Flow', xml: '', preview: '${IMG}', previewSvg: '${IMG}' }];
    inlineExpandNoteNodeIds = new Set([1]); inlineExpandRemarksNodeIds = new Set([1]); inlineExpandDiagramNodeIds = new Set([1]);
    collapsedIds = new Set(); editingId = null; render();
  `);
  const r = await page.evaluate(() => {
    const kind = (el: Element) => el.matches('.node-note-line-wrap') ? 'note' : el.matches('.node-table-line-wrap') ? 'table'
      : el.matches('.node-image-line-wrap') ? 'images' : el.matches('.node-diagram-line') ? 'diagram' : el.matches('.thread-entry') ? 'thread' : '';
    const outline = [...document.querySelectorAll('.node-note-line-wrap,.node-table-line-wrap,.node-image-line-wrap,.node-diagram-line,.thread-entry')].map(kind);
    (window as any).renderPreviewBody();
    const pdfKind = (el: Element) => el.matches('.pv-remark-block') ? 'thread' : el.matches('.pv-node-images') ? 'images'
      : el.querySelector('.pv-inline-label-note') ? 'note' : el.querySelector('.pv-table-figure') ? 'table' : el.querySelector('.pv-diagram-figure') ? 'diagram' : '';
    const pdf = [...document.querySelectorAll('#preview-doc > *')].map(pdfKind).filter(Boolean);
    return { outline: [...new Set(outline)], pdf: [...new Set(pdf)] };
  });
  expect(r.outline).toEqual(['note', 'table', 'images', 'diagram', 'thread']);
  expect(r.pdf).toEqual(['note', 'table', 'images', 'diagram', 'thread']);
});

// Owner (2026-10-15): in the PDF the thread header lines up with its entries — icon centred over
// the kind circles, "Thread · N" on the names' column — and the block starts on the table's column.
test('PDF: the thread header lines up with the entries and the row content', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 1200 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    nodes = [{ id: 1, depth: 0, text: 'Cutover', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} },
      { id: 2, depth: 1, text: 'Shipping', parentId: 1, isCheckbox: false, checked: false, note: '',
        tables: ['<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>1</td></tr></tbody></table>'], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 3;
    remarks = [{ id: 'c1', anchorNodeId: 2, person: 'Ana', date: '2026-10-15', text: 'A comment.', createdAt: 1 }];
    inlineExpandRemarksNodeIds = new Set([2]); collapsedIds = new Set(); editingId = null; render();
  `);
  const m = await page.evaluate(() => {
    (window as any).renderPreviewBody();
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;width:900px;background:#fff;z-index:99999';
    host.appendChild(document.getElementById('preview-doc')!); document.body.appendChild(host);
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const icon = box('.pv-remark-block .pv-inline-label svg'), kind = box('.pv-thread-body .pv-remark-entry > :first-child');
    return {
      table: Math.round(box('#preview-doc table').left), kind: Math.round(kind.left),
      iconCentre: icon.left + icon.width / 2, kindCentre: kind.left + kind.width / 2,
      label: box('.pv-remark-block .pv-inline-label span').left, name: box('.pv-thread-body .pv-remark-meta').left
    };
  });
  expect(m.kind).toBe(m.table);
  expect(Math.abs(m.iconCentre - m.kindCentre)).toBeLessThan(1);
  expect(Math.abs(m.label - m.name)).toBeLessThan(1);
});
