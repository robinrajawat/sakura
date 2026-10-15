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
