import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Row links are real links (owner, 2026-10-22: no syntax in row text): @ picks a row and its name
// goes in as words linked to that row's id (mark kind r, src/utils/rowMarks.ts), so the link
// survives renames; old typed [[Row name]] converts once. Helpers mirror row-rich-text.spec.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

type Row = { depth?: number; text: string; marks?: unknown[] };
async function seed(page: Page, rows: Row[]) {
  await page.evaluate((rows) => {
    const w = window as any;
    w.eval(`nodes = ${JSON.stringify(rows.map((r, i) => ({ id: i + 1, depth: r.depth || 0, text: r.text, marks: r.marks, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })))}.map(normalizeNode);
      rebuildParentIds(); nextId = ${rows.length + 1}; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false;
      focusedId = null; editingId = null; undoStack = []; redoStack = []; render();`);
  }, rows);
}
const rows = (page: Page) =>
  page.evaluate(() => (window as any).eval('nodes.map(n => ({ text: n.text, marks: rowMarksOf(n) }))')) as Promise<{ text: string; marks: unknown[] }[]>;
const label = (page: Page, id: number) => page.locator(`.node-row[data-id="${id}"] .node-label`);

test('@ links a row: its name goes in as linked words, and you keep typing after it', async ({ page }) => {
  await seed(page, [{ text: 'Route Determination' }, { text: 'See ' }]);
  await label(page, 2).click();
  await expect(page.locator('#in-2')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type('@route');
  await expect(page.locator('#at-suggest')).toHaveClass(/open/);
  await page.keyboard.press('Enter');
  await page.keyboard.type('first');
  await page.keyboard.press('Escape');
  expect((await rows(page))[1]).toEqual({ text: 'See Route Determination first', marks: [{ s: 4, e: 23, k: 'r', v: '1' }] });
  await expect(label(page, 2).locator('.bl-link')).toHaveText('Route Determination');
  await expect(label(page, 2)).not.toContainText('[[');
});

test('clicking a row link goes to the linked row', async ({ page }) => {
  await seed(page, [{ text: 'Plan' }, { text: 'Middle' }, { text: 'See Plan', marks: [{ s: 4, e: 8, k: 'r', v: '1' }] }]);
  await label(page, 3).locator('.bl-link').click();
  await expect.poll(() => page.evaluate(() => (window as any).eval('[selectedId, editingId]'))).toEqual([1, null]);
});

test('renaming the linked row: a link showing its old name follows, other wording stays; both still point at it', async ({ page }) => {
  await seed(page, [
    { text: 'Plan' },
    { text: 'See Plan now', marks: [{ s: 4, e: 8, k: 'r', v: '1' }] },
    { text: 'See the plan', marks: [{ s: 4, e: 12, k: 'r', v: '1' }, { s: 8, e: 12, k: 'b' }] }
  ]);
  await label(page, 1).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' B');
  await page.keyboard.press('Escape');
  const r = await rows(page);
  expect(r[1]).toEqual({ text: 'See Plan B now', marks: [{ s: 4, e: 10, k: 'r', v: '1' }] });
  expect(r[2]).toEqual({ text: 'See the plan', marks: [{ s: 4, e: 12, k: 'r', v: '1' }, { s: 8, e: 12, k: 'b' }] });
  await page.keyboard.press(`${mod}+z`);
  expect((await rows(page)).map((x) => x.text)).toEqual(['Plan', 'See Plan now', 'See the plan']);
});

test('deleting the linked row leaves the words as plain text; undo brings the link back', async ({ page }) => {
  await seed(page, [{ text: 'Plan' }, { text: 'See Plan', marks: [{ s: 4, e: 8, k: 'r', v: '1' }] }]);
  await page.evaluate(() => (window as any).eval('setSingleSelection(1); render(); deleteSelected()'));
  expect(await rows(page)).toEqual([{ text: 'See Plan', marks: [] }]);
  await page.evaluate(() => (window as any).eval('undo()'));
  expect((await rows(page))[1]).toEqual({ text: 'See Plan', marks: [{ s: 4, e: 8, k: 'r', v: '1' }] });
});

test('merging the linked row into the row above moves its links there', async ({ page }) => {
  await seed(page, [{ text: 'Plan' }, { text: 'B' }, { text: 'See B', marks: [{ s: 4, e: 5, k: 'r', v: '2' }] }]);
  await page.evaluate(() => (window as any).eval("mergeNodeIntoPrevAndFocus(2, 'B')"));
  await page.keyboard.press('Escape');
  const r = await rows(page);
  expect(r.map((x) => x.text)).toEqual(['PlanB', 'See B']);
  expect(r[1].marks).toEqual([{ s: 4, e: 5, k: 'r', v: '1' }]);
});

test('typed [[ ]] in a row stays as typed', async ({ page }) => {
  await seed(page, [{ text: 'Plan' }, { text: '' }]);
  await label(page, 2).click();
  await page.keyboard.type('see [[Plan]]');
  await page.keyboard.press('Escape');
  expect((await rows(page))[1]).toEqual({ text: 'see [[Plan]]', marks: [] });
  await expect(label(page, 2)).toHaveText('see [[Plan]]');
});

async function openSavedDoc(page: Page, docId: string, doc: Record<string, unknown>) {
  await page.addInitScript(({ docId, doc }) => {
    if (sessionStorage.getItem('seeded-' + docId)) return;
    sessionStorage.setItem('seeded-' + docId, '1');
    localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify(doc));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Old', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', docId);
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
  }, { docId, doc });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined" && nodes.length > 0');
}
const row = (id: number, depth: number, text: string) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });

test('an old document converts [[Row name]] once to real links, old version kept', async ({ page }) => {
  await openSavedDoc(page, 'linkdoc', {
    rowFormat: 3,
    nodes: [row(1, 0, 'Route Determination'), row(2, 0, 'See [[route determination]] and [[Gone]]'), { ...row(3, 0, '[[Route Determination]] first'), marks: [{ s: 0, e: 23, k: 'b' }], marksText: '[[Route Determination]] first' }],
    nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Old', author: ''
  });
  await expect.poll(() => rows(page)).toEqual([
    { text: 'Route Determination', marks: [] },
    { text: 'See route determination and Gone', marks: [{ s: 4, e: 23, k: 'r', v: '1' }] },
    { text: 'Route Determination first', marks: [{ s: 0, e: 19, k: 'b' }, { s: 0, e: 19, k: 'r', v: '1' }] }
  ]);
  await expect(page.locator('.node-row[data-id="2"] .node-label .bl-link')).toHaveText('route determination');
  await expect.poll(() => page.evaluate(() => (window as any).eval(`(async () => (await loadDocRevisions('linkdoc')).map(r => r.reason))()`))).toContain('Before row links became real links');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_doc_v1_linkdoc') || '{}'));
  expect(stored.rowFormat).toBe(4);
  expect(stored.nodes[1].text).toBe('See route determination and Gone');
});
