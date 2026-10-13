import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Expand all / Collapse all cover inline objects (notes, Q&A, remarks, diagrams open or close;
// tables and images unfold or fold), and a diagram with content but no preview image — e.g. after
// a Version History restore — gets its preview rebuilt in the background instead of showing
// "No preview yet" until it's opened and saved.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const IMG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#9ab"/></svg>').toString('base64');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate((img) => {
    const n = (id: number, depth: number, text: string, extra = {}) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...extra });
    // @ts-expect-error -- bare globals
    nodes = [n(1, 0, 'Parent', { note: '<p>Parent note</p>' }), n(2, 1, 'Child', { tables: ['<table><tr><th>A</th></tr><tr><td>Cell one</td></tr></table>'], images: [{ id: 'i1', src: img, caption: '', annotations: [], createdAt: 1 }] })];
    // @ts-expect-error -- bare globals
    rebuildParentIds(); nextId = 3;
    // @ts-expect-error -- bare globals
    remarks = [{ id: 'r1', anchorNodeId: 2, person: 'A', date: '2026-10-01', text: 'A remark', createdAt: 1 }];
    // @ts-expect-error -- bare globals
    qaItems = [{ id: 'q1', question: 'A question?', answer: '', sourceNodeId: 1, createdAt: 1 }];
    // @ts-expect-error -- bare globals
    diagrams = [{ id: 'd1', title: 'Flow', xml: '<mxfile/>', previewSvg: 'data:image/svg+xml;base64,PHN2Zy8+', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 2, createdAt: 1, modifiedAt: 1, _hydrated: true }];
    // @ts-expect-error -- bare globals
    collapsedIds = new Set(); editingId = null; render();
  }, IMG);
  return errors;
}

const shown = (page: Page) => page.evaluate(() => ({
  note: !!document.querySelector('.node-note-line'),
  qa: !!document.querySelector('.node-qa-line'),
  remark: !!document.querySelector('.node-remark-text-inline'),
  diagram: !!document.querySelector('.node-diagram-line'),
  table: !!document.querySelector('.node-table-line'),
  images: !!document.querySelector('.node-image-line-wrap'),
  child: !!document.querySelector('.node-row[data-id="2"]'),
}));

test('Expand all opens every inline object; Collapse all closes them with the branches', async ({ page }) => {
  const errors = await seed(page);
  // Notes, Q&A, remarks and diagrams start closed, so the toggle's first action is Expand all.
  expect(await page.evaluate('anyFoldClosed()')).toBe(true);
  await page.evaluate('toggleFoldAll()');
  expect(await shown(page)).toEqual({ note: true, qa: true, remark: true, diagram: true, table: true, images: true, child: true });
  expect(await page.evaluate('anyFoldClosed()')).toBe(false);

  await page.evaluate('toggleFoldAll()');
  expect(await shown(page)).toEqual({ note: false, qa: false, remark: false, diagram: false, table: false, images: false, child: false });
  // Tables and images were folded too, not just hidden with the branch.
  expect(await page.evaluate('[collapsedTableNodeIds.has(2), collapsedImageNodeIds.has(2)]')).toEqual([true, true]);

  await page.evaluate('expandAll()');
  expect(await shown(page)).toEqual({ note: true, qa: true, remark: true, diagram: true, table: true, images: true, child: true });
  expect(errors).toEqual([]);
});

test('a diagram with content but no preview gets it rebuilt in the background, once', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate(`
    window.__regen = [];
    regenerateDiagramThumbnail = (id, opts) => { window.__regen.push([id, !!(opts && opts.silent)]); const d = findDiagram(id); d.previewSvg = 'data:image/svg+xml;base64,PHN2Zy8+'; return Promise.resolve(); };
    diagrams.push({ id: 'd2', title: 'Restored', xml: '<mxfile/>', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 1, createdAt: 2, modifiedAt: 2, _hydrated: true });
    diagrams.push({ id: 'd3', title: 'Empty', xml: '', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 1, createdAt: 3, modifiedAt: 3, _hydrated: true });
    regenerateMissingDiagramPreviews();
  `);
  await expect.poll(() => page.evaluate('window.__regen')).toEqual([['d2', true]]);
  // Only diagrams with content and no preview; never twice in a session.
  await page.evaluate("findDiagram('d2').previewSvg = ''; regenerateMissingDiagramPreviews();");
  await page.waitForTimeout(100);
  expect(await page.evaluate('window.__regen.length')).toBe(1);
  expect(errors).toEqual([]);
});
