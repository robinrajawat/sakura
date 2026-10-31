import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Deleting a row deletes its inline objects with it (they used to stay behind, orphaned and
// invisible — and printed blank at the end of PDFs). Owner rule: only ask when part of the delete
// can't be undone — diagrams, which live outside the undo snapshot — with a prominent warning;
// everything else deletes straight away, the toast names what went, and Undo restores it. Opening
// a document also removes, once, any Q&A/remarks/diagrams already left without a row.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text, extra) => Object.assign({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }, extra || {});
    nodes = [ n(1, 0, 'Keep'), n(2, 0, 'With objects', { note: '<p>A note</p>' }), n(3, 1, 'Child'), n(4, 0, 'Plain'), n(5, 0, 'Has diagram') ];
    rebuildParentIds(); nextId = 6;
    remarks = [
      { id: 'r1', anchorNodeId: 2, person: 'A', date: '2026-10-01', text: 'On the row', createdAt: 1 },
      { id: 'r2', anchorNodeId: 3, person: 'B', date: '2026-10-01', text: 'On the child', createdAt: 2 },
      { id: 'r3', anchorNodeId: 1, person: 'C', date: '2026-10-01', text: 'Elsewhere', createdAt: 3 }
    ];
    qaItems = [ { id: 'q1', question: 'Why?', answer: '', sourceNodeId: 2, createdAt: 1 } ];
    diagrams = [ { id: 'd1', title: 'Flow', xml: '', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 5, createdAt: 1, modifiedAt: 1, _hydrated: true } ];
    collapsedIds = new Set(); editingId = null; undoStack = []; redoStack = []; render();
  `);
  return errors;
}

async function startDelete(page: Page, id: number) {
  await page.evaluate(`setSingleSelection(${id}); render(); window.__del = confirmDeleteIfNeeded().then(ok => { if (ok) deleteSelected(); return ok; }); 0;`);
}

test('a row with undoable objects deletes them with it without asking, and Undo restores them', async ({ page }) => {
  const errors = await seed(page);
  await startDelete(page, 2);
  expect(await page.evaluate('window.__del')).toBe(true);
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#toast')).toHaveText('Deleted 2 rows with 1 note, 1 question and 2 comments');
  expect(await page.evaluate('nodes.map(n => n.id)')).toEqual([1, 4, 5]);
  expect(await page.evaluate('remarks.map(r => r.id)')).toEqual(['r3']);
  expect(await page.evaluate('qaItems.length')).toBe(0);

  await page.evaluate('undo()');
  expect(await page.evaluate('nodes.map(n => n.id)')).toEqual([1, 2, 3, 4, 5]);
  // The row's question is a discussion item now (migrated from Q&A on render).
  expect(await page.evaluate('remarks.map(r => r.id).sort()')).toEqual(['r1', 'r2', 'r3', 'rq1']);
  expect(await page.evaluate('qaItems.length')).toBe(0);
  expect(errors).toEqual([]);
});

test('a diagram gets a prominent can\'t-undo warning; Cancel keeps everything', async ({ page }) => {
  const errors = await seed(page);
  await startDelete(page, 5);
  const warn = page.locator('#sakura-modal-warning');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveText('1 diagram will be permanently deleted. Undo can’t bring it back.');
  await expect(page.locator('#sakura-modal-body')).not.toContainText('This also deletes');
  await page.locator('#sakura-modal-actions button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate('window.__del')).toBe(false);
  expect(await page.evaluate('diagrams.length')).toBe(1);

  await startDelete(page, 5);
  await page.locator('#sakura-modal-actions button', { hasText: 'Delete' }).click();
  await page.evaluate('window.__del');
  expect(await page.evaluate('diagrams.length')).toBe(0);
  await page.evaluate('undo()');
  expect(await page.evaluate('nodes.some(n => n.id === 5)')).toBe(true);
  expect(await page.evaluate('diagrams.length')).toBe(0);
  // The warning slot is cleared for the next dialog.
  await page.evaluate('window.__c = sakuraConfirm({ title: "x", body: "y" }); 0;');
  await expect(page.locator('#sakura-modal-warning')).toBeHidden();
  await page.locator('#sakura-modal-actions button', { hasText: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('a plain row still deletes without asking', async ({ page }) => {
  await seed(page);
  await startDelete(page, 4);
  expect(await page.evaluate('window.__del')).toBe(true);
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  expect(await page.evaluate('nodes.map(n => n.id)')).toEqual([1, 2, 3, 5]);
});

test('Backspace on an empty row takes its remark along undoably, but asks first for a diagram', async ({ page }) => {
  await seed(page);
  await page.evaluate(`
    const blank = id => ({ id, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes.push(blank(6), blank(7));
    remarks.push({ id: 'r6', anchorNodeId: 6, person: 'D', date: '2026-10-01', text: 'Goes along', createdAt: 9 });
    diagrams.push({ id: 'd7', title: 'Kept', xml: '', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', anchorNodeId: 7, createdAt: 1, modifiedAt: 1, _hydrated: true });
    nextId = 8; render(); beginEdit(6, true);
  `);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  expect(await page.evaluate('nodes.some(n => n.id === 6)')).toBe(false);
  expect(await page.evaluate("remarks.some(r => r.id === 'r6')")).toBe(false);
  await page.evaluate('undo()');
  expect(await page.evaluate("remarks.some(r => r.id === 'r6')")).toBe(true);

  await page.evaluate('beginEdit(7, true)');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#sakura-modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#sakura-modal-warning')).toBeVisible();
  await page.locator('#sakura-modal-actions button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate('nodes.some(n => n.id === 7)')).toBe(true);
  expect(await page.evaluate("diagrams.some(d => d.id === 'd7')")).toBe(true);
});

test('Clear all rows says what goes with them and removes it', async ({ page }) => {
  await seed(page);
  await page.evaluate('window.__clear = clearAllNodes(); 0;');
  await expect(page.locator('#sakura-modal-body')).toContainText('This also deletes 1 note, 1 question and 3 comments.');
  await expect(page.locator('#sakura-modal-warning')).toHaveText('1 diagram will be permanently deleted. Undo can’t bring it back.');
  await page.locator('#sakura-modal-actions button', { hasText: 'Clear all' }).click();
  await page.evaluate('window.__clear');
  expect(await page.evaluate('[nodes.length, remarks.length, qaItems.length, diagrams.length]')).toEqual([0, 0, 0, 0]);
});

test('opening a document removes Q&A, remarks and diagrams left without a row, once', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('orphan_seeded')) return;
    sessionStorage.setItem('orphan_seeded', '1');
    const n = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_orph', JSON.stringify({
      nodes: [n(1, 'Row')], nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Orphans', author: '',
      remarks: [
        { id: 'keep', anchorNodeId: 1, person: 'A', text: 'On the row', createdAt: 1 },
        { id: 'gone', anchorNodeId: 42, person: '', text: '', createdAt: 2 },
        { id: 'pad', anchorNodeId: null, person: 'B', text: 'Old Pad remark', createdAt: 3 }
      ],
      qa: [{ id: 'qk', question: 'Q?', answer: '', sourceNodeId: 1 }, { id: 'qg', question: 'Lost?', answer: '', sourceNodeId: 7 }],
      diagrams: [{ id: 'dg', title: 'Lost', anchorNodeId: 9, status: 'draft', pageCount: 1, createdAt: 1, modifiedAt: 1 }]
    }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'orph', title: 'Orphans', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', 'orph');
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: ['orph'], pinned: [], active: 'orph' }));
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof nodes !== "undefined" && nodes.length === 1 && nodes[0].text === "Row"');
  expect(await page.evaluate('[remarks.map(r => r.id), qaItems.map(q => q.id), diagrams.length]')).toEqual([['keep', 'rqk'], [], 0]);
  // Saved through the normal save path.
  await expect.poll(() => page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('sakura_doc_v1_orph') || '{}');
    return [(d.remarks || []).length, (d.qa || []).length, (d.diagrams || []).length];
  })).toEqual([2, 0, 0]);
});
