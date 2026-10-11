import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Backspace/Delete row merges (mergeNodeIntoPrevAndFocus / mergeNextNodeIntoAndFocus) used to keep
// only the absorbed row's text (and, since #473, its images): its note and tables were silently
// dropped, and Q&A, remarks, diagrams and to-dos linked to it were left pointing at a row that no
// longer existed. Everything now moves onto the row that stays.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'mergedoc';

test.beforeEach(async ({ page }) => {
  // Everything is seeded before the first load (never write-then-reload: that pattern is flaky
  // under parallel load in this repo). The welcome modal's ~500ms timer is disabled the same way.
  await page.addInitScript((docId) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: 'Alpha note', tables: ['<table><tr><td>A</td></tr></table>'], tags: ['one'], styles: {} },
          { id: 2, depth: 0, text: 'Bravo', parentId: null, isCheckbox: false, checked: false, note: 'Bravo note', noteTitle: 'Bravo title', tables: ['<table><tr><td>B</td></tr></table>'], tags: ['one', 'two'], styles: {} },
          { id: 3, depth: 0, text: 'Charlie', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} }
        ],
        nextId: 4, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Merge', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Merge', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
      localStorage.setItem('sakura_todos_v1', JSON.stringify([
        { id: 't1', text: 'Follow up on Bravo', done: false, createdAt: 1, nodeRef: { docId, nodeId: 2 } }
      ]));
    } catch { /* storage unavailable */ }
  }, DOC_ID);
});

async function load(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  await expect(page.locator('.node-row')).toHaveCount(3, { timeout: 15000 });
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    qaItems = [{ id: 'q1', question: 'Why Bravo?', answer: '', sourceNodeId: 2 }];
    // @ts-expect-error
    remarks = [{ id: 'r1', person: 'Sam', text: 'Check Bravo', anchorNodeId: 2 }];
    // @ts-expect-error
    diagrams = [{ id: 'd1', title: 'Bravo flow', anchorNodeId: 2 }];
    // @ts-expect-error
    collapsedIds = new Set(); undoStack = []; redoStack = []; render();
  });
  return errors;
}

function readState(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    // @ts-expect-error -- bare globals
    nodes: nodes.map((n) => ({ id: n.id, text: n.text, note: n.note, noteTitle: n.noteTitle, tables: n.tables.length, tags: n.tags })),
    // @ts-expect-error
    qa: qaItems.map((q) => q.sourceNodeId),
    // @ts-expect-error
    remarks: remarks.map((r) => r.anchorNodeId),
    // @ts-expect-error
    diagrams: diagrams.map((d) => d.anchorNodeId),
    todoOnSurvivor: (window as unknown as { sakuraTodoRefsForNode: (d: string, n: number) => unknown[] }).sakuraTodoRefsForNode('mergedoc', 1).length,
    todoOnAbsorbed: (window as unknown as { sakuraTodoRefsForNode: (d: string, n: number) => unknown[] }).sakuraTodoRefsForNode('mergedoc', 2).length
  }));
}

test.describe('Row merges keep the absorbed row\'s content and links', () => {
  test('Backspace-merge moves note, tables, tags and links onto the row above; Undo restores the row', async ({ page }) => {
    const errors = await load(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals
      mergeNodeIntoPrevAndFocus(2, 'Bravo');
    });
    const after = await readState(page);
    expect(after.nodes.map((n) => n.id)).toEqual([1, 3]);
    expect(after.nodes[0]).toEqual({ id: 1, text: 'AlphaBravo', note: 'Alpha note<br>Bravo note', noteTitle: 'Bravo title', tables: 2, tags: ['one', 'two'] });
    expect(after.qa).toEqual([1]);
    expect(after.remarks).toEqual([1]);
    expect(after.diagrams).toEqual([1]);
    expect(after.todoOnSurvivor).toBe(1);
    expect(after.todoOnAbsorbed).toBe(0);

    // One Undo brings the absorbed row back with its own content; Q&A and remarks (which are in
    // the undo snapshot) go back to it too.
    await page.evaluate(() => {
      // @ts-expect-error
      editingId = null; undo();
    });
    const undone = await readState(page);
    expect(undone.nodes.map((n) => n.id)).toEqual([1, 2, 3]);
    expect(undone.nodes[1]).toMatchObject({ text: 'Bravo', note: 'Bravo note', tables: 1 });
    expect(undone.nodes[0]).toMatchObject({ note: 'Alpha note', tables: 1 });
    expect(undone.qa).toEqual([2]);
    expect(undone.remarks).toEqual([2]);
    expect(errors).toEqual([]);
  });

  test('Delete-merge pulls the next row\'s content up the same way; empty notes are not joined', async ({ page }) => {
    const errors = await load(page);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals
      mergeNextNodeIntoAndFocus(2, 'Bravo');
    });
    const after = await readState(page);
    expect(after.nodes.map((n) => n.id)).toEqual([1, 2]);
    // Charlie has no note or tables: Bravo's stay exactly as they were.
    expect(after.nodes[1]).toEqual({ id: 2, text: 'BravoCharlie', note: 'Bravo note', noteTitle: 'Bravo title', tables: 1, tags: ['one', 'two'] });
    // Nothing was linked to Charlie, so Bravo's links are untouched.
    expect(after.qa).toEqual([2]);
    expect(after.todoOnAbsorbed).toBe(1);

    // Now merge Bravo (with content and links) forward-into Alpha's row via Delete at Alpha's end.
    await page.evaluate(() => {
      // @ts-expect-error
      mergeNextNodeIntoAndFocus(1, 'Alpha');
    });
    const after2 = await readState(page);
    expect(after2.nodes.map((n) => n.id)).toEqual([1]);
    expect(after2.nodes[0]).toMatchObject({ text: 'AlphaBravoCharlie', note: 'Alpha note<br>Bravo note', tables: 2 });
    expect(after2.qa).toEqual([1]);
    expect(after2.remarks).toEqual([1]);
    expect(after2.diagrams).toEqual([1]);
    expect(after2.todoOnSurvivor).toBe(1);
    expect(errors).toEqual([]);
  });

  test('block-level notes are joined without an extra blank line', async ({ page }) => {
    const errors = await load(page);
    const note = await page.evaluate(() => {
      // @ts-expect-error -- bare globals
      nodes[0].note = '<div>First</div>'; nodes[1].note = '<div>Second</div>';
      // @ts-expect-error
      mergeNodeIntoPrevAndFocus(2, 'Bravo');
      // @ts-expect-error
      return nodes[0].note;
    });
    expect(note).toBe('<div>First</div><div>Second</div>');
    expect(errors).toEqual([]);
  });
});
