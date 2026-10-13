import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Deleting a row deletes its inline objects with it (they used to stay behind, orphaned and
// invisible — and printed blank at the end of PDFs). Owner decision: confirm whenever the rows
// hold inline objects, say what Undo restores, and show a prominent warning for diagrams, which
// live outside the undo snapshot and so can't come back.

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

test('a row with inline objects asks first, deletes them with it, and Undo restores them', async ({ page }) => {
  const errors = await seed(page);
  await startDelete(page, 2);
  await expect(page.locator('#sakura-modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#sakura-modal-body')).toContainText('This also deletes 1 note, 1 question and 2 remarks. Undo (Ctrl/Cmd+Z) brings them back.');
  await expect(page.locator('#sakura-modal-warning')).toBeHidden();
  await page.locator('#sakura-modal-actions button', { hasText: 'Delete' }).click();
  await page.evaluate('window.__del');
  expect(await page.evaluate('nodes.map(n => n.id)')).toEqual([1, 4, 5]);
  expect(await page.evaluate('remarks.map(r => r.id)')).toEqual(['r3']);
  expect(await page.evaluate('qaItems.length')).toBe(0);

  await page.evaluate('undo()');
  expect(await page.evaluate('nodes.map(n => n.id)')).toEqual([1, 2, 3, 4, 5]);
  expect(await page.evaluate('remarks.map(r => r.id).sort()')).toEqual(['r1', 'r2', 'r3']);
  expect(await page.evaluate('qaItems.map(q => q.id)')).toEqual(['q1']);
  expect(errors).toEqual([]);
});

test('a diagram gets a prominent can\'t-undo warning; Cancel keeps everything', async ({ page }) => {
  const errors = await seed(page);
  await startDelete(page, 5);
  const warn = page.locator('#sakura-modal-warning');
  await expect(warn).toBeVisible();
  await expect(warn).toHaveText('1 diagram will be permanently deleted. Undo can’t bring it back.');
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
  await startDelete(page, 2);
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

test('Backspace on an empty row that holds a remark asks instead of deleting silently', async ({ page }) => {
  await seed(page);
  await page.evaluate(`
    nodes.push({ id: 6, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    remarks.push({ id: 'r6', anchorNodeId: 6, person: 'D', date: '2026-10-01', text: 'Keep asking', createdAt: 9 });
    nextId = 7; render(); beginEdit(6, true);
  `);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#sakura-modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#sakura-modal-body')).toContainText('1 remark');
  await page.locator('#sakura-modal-actions button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate('nodes.some(n => n.id === 6)')).toBe(true);
  expect(await page.evaluate("remarks.some(r => r.id === 'r6')")).toBe(true);
});

test('Clear all nodes says what goes with them and removes it', async ({ page }) => {
  await seed(page);
  await page.evaluate('window.__clear = clearAllNodes(); 0;');
  await expect(page.locator('#sakura-modal-body')).toContainText('This also deletes 1 note, 1 question and 3 remarks.');
  await expect(page.locator('#sakura-modal-warning')).toHaveText('1 diagram will be permanently deleted. Undo can’t bring it back.');
  await page.locator('#sakura-modal-actions button', { hasText: 'Clear all' }).click();
  await page.evaluate('window.__clear');
  expect(await page.evaluate('[nodes.length, remarks.length, qaItems.length, diagrams.length]')).toEqual([0, 0, 0, 0]);
});
