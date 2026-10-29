import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Version history robustness (owner, 2026-10-29: "check that our versioning is absolutely
// robust, everything is covered"): threads come back on restore, thread-only edits count as a
// change, a big removal keeps a safety copy inside the 10-minute gap, Reload latest and another
// device's copy are kept as versions, and two versions saved at once both land.

const DOC = 'robustdoc';
const row = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });

async function open(page: Page) {
  await page.addInitScript(([docId, rows]) => {
    try {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: rows, nextId: 7, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Plan', author: '',
        remarks: [{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-19', text: 'Keep this comment', createdAt: 1 }]
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Plan', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, [DOC, [1, 2, 3, 4, 5, 6].map((i) => row(i, 'Row ' + i))] as const);
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof saveToStorage === "function" && typeof trimVersions === "function"');
}

const versions = (page: Page) => page.evaluate(`loadDocRevisions('${DOC}').then(l => l.map(v => ({ reason: v.reason, rows: v.nodes.length, remarks: (v.remarks || []).length })))`) as Promise<{ reason: string; rows: number; remarks: number }[]>;

test('restoring a version brings its threads back with its rows', async ({ page }) => {
  await open(page);
  await page.evaluate('saveManualDocVersion(currentDocId)');
  await page.evaluate('remarks = []; nodes = nodes.slice(0, 5); markDirty(); saveToStorage();');
  const list = await versions(page);
  expect(list[list.length - 1]).toMatchObject({ reason: 'Manual checkpoint', remarks: 1 });
  await page.evaluate(`loadDocRevisions('${DOC}').then(l => restoreDocRevision('${DOC}', l.find(v => v.reason === 'Manual checkpoint').ts))`);
  expect(await page.evaluate('remarks.map(r => r.text)')).toEqual(['Keep this comment']);
  expect(await page.evaluate('nodes.length')).toBe(6);
});

test('Clear all rows soon after a version still keeps the rows as a version', async ({ page }) => {
  await open(page);
  await page.evaluate('saveManualDocVersion(currentDocId)');
  await page.evaluate('nodes[0].text = "Row 1 edited"; markDirty(); saveToStorage();');
  await page.evaluate('nodes = []; remarks = []; markDirty(); saveToStorage();');
  await expect.poll(async () => (await versions(page)).map((v) => v.reason)).toEqual(['Manual checkpoint', 'Before a large change']);
  expect((await versions(page))[1]).toMatchObject({ rows: 6, remarks: 1 });
  // An everyday edit inside the gap still makes no version.
  await page.evaluate('nodes = [{ id: 9, depth: 0, text: "New", parentId: null, isCheckbox: false, checked: false, note: "", tables: [], images: [], tags: [], styles: {} }]; markDirty(); saveToStorage();');
  await page.evaluate('nodes[0].text = "Newer"; markDirty(); saveToStorage();');
  await expect.poll(async () => (await versions(page)).length).toBe(2);
});

test('a thread-only change counts as a change', async ({ page }) => {
  await open(page);
  await page.evaluate('saveManualDocVersion(currentDocId)');
  // Make the last version old enough for the next automatic one.
  await page.evaluate(`loadDocRevisions('${DOC}').then(l => { l[l.length - 1].ts -= 11 * 60000; return saveDocRevisions('${DOC}', l); })`);
  await page.evaluate('remarks[0].text = "Edited comment"; markDirty(); saveToStorage();');
  await page.evaluate('remarks[0].text = "Edited again"; markDirty(); saveToStorage();');
  await expect.poll(async () => (await versions(page)).map((v) => v.reason)).toEqual(['Manual checkpoint', 'Auto']);
});

test('the copy another device or tab wrote is kept before this tab overwrites it, and Reload latest keeps this tab’s copy', async ({ page }) => {
  await open(page);
  // Another tab writes the stored copy (the banner case), then this tab saves over it.
  await page.evaluate(`(() => { const d = JSON.parse(localStorage.getItem(docKey('${DOC}'))); d.nodes = d.nodes.slice(0, 2); localStorage.setItem(docKey('${DOC}'), JSON.stringify(d)); _foreignDocVersionPending = currentDocId; })()`);
  await page.evaluate('nodes[0].text = "Mine"; markDirty(); saveToStorage();');
  await expect.poll(async () => (await versions(page)).map((v) => [v.reason, v.rows])).toEqual([['Before changes from another device', 2]]);
  // Reload latest drops what's on screen for the other copy: what's on screen is kept first.
  await page.evaluate(`(() => { const d = JSON.parse(localStorage.getItem(docKey('${DOC}'))); d.nodes = d.nodes.slice(0, 3); localStorage.setItem(docKey('${DOC}'), JSON.stringify(d)); })()`);
  await page.evaluate('nodes[1].text = "Also mine"; reloadCurrentDocFromOtherTab();');
  await expect.poll(async () => (await versions(page)).map((v) => [v.reason, v.rows])).toEqual([['Before changes from another device', 2], ['Before reloading the other version', 6]]);
  expect(await page.evaluate('nodes.length')).toBe(3);
});

test('a document not on screen keeps its local copy before sync replaces it', async ({ page }) => {
  await open(page);
  await page.evaluate(`keepLocalDocBeforeIncoming('${DOC}', { nodes: [], title: 'Plan' })`);
  await page.evaluate(`keepLocalDocBeforeIncoming('${DOC}', { nodes: [], title: 'Plan' })`); // once, not twice
  const stored = await page.evaluate(`JSON.parse(localStorage.getItem(docKey('${DOC}'))).nodes.length`);
  await expect.poll(async () => (await versions(page)).map((v) => [v.reason, v.rows])).toEqual([['Before changes from another device', stored]]);
});

test('two versions saved at the same moment both land', async ({ page }) => {
  await open(page);
  await page.evaluate(`Promise.all([recordDocRevision('${DOC}', currentDocRevisionContent(), 'Manual checkpoint'), recordDocRevision('${DOC}', currentDocRevisionContent(), 'Manual checkpoint')])`);
  expect((await versions(page)).length).toBe(2);
});

test('To-Dos: another device’s list is kept as a version, and version lists from two devices are joined', async ({ page }) => {
  await open(page);
  await page.evaluate(`(() => {
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 't1', text: 'Local task', done: false }]));
    localStorage.setItem('sakura_todos_revisions_v1', JSON.stringify([{ ts: 1000, reason: 'Auto', todos: [] }]));
  })()`);
  expect(await page.evaluate(`applyIncomingMetaData('todos', { updatedAt: Date.now() + 60000, value: [{ id: 't2', text: 'Phone task', done: false }] })`)).toBe(true);
  let revs = await page.evaluate(`JSON.parse(localStorage.getItem('sakura_todos_revisions_v1'))`) as { ts: number; reason: string; todos: { text: string }[] }[];
  expect(revs.map((r) => r.reason)).toEqual(['Auto', 'Before changes from another device']);
  expect(revs[1].todos[0].text).toBe('Local task');
  expect(await page.evaluate(`applyIncomingMetaData('todosRevisions', { updatedAt: Date.now() + 120000, value: [{ ts: 500, reason: 'Auto', todos: [] }] })`)).toBe(true);
  revs = await page.evaluate(`JSON.parse(localStorage.getItem('sakura_todos_revisions_v1'))`);
  expect(revs.map((r) => r.ts)).toEqual([500, 1000, revs[2].ts]);
});
