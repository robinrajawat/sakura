import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-20: a thread added on the phone vanished on the Mac and the other way round. Both
// devices had changed the document, and the copy that reached the account second went to Version
// history as "Your changes on this device", thread included. Now the account's copy is still kept,
// but thread entries from both copies are merged by id (src/state/threadMerge.ts). Real sync code
// against the in-memory Firestore stand-in of sync-data-safety.spec.ts.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const store: Record<string, Record<string, unknown>> = {};
    (window as unknown as { __cloud: typeof store }).__cloud = store;
    const ref = (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') });
    const snap = (p: string) => ({ id: p.split('/').pop(), ref: { path: p }, exists: () => p in store, data: () => (p in store ? { ...store[p] } : undefined) });
    const set = (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => { store[r.path] = o && o.merge ? { ...(store[r.path] || {}), ...d } : { ...d }; };
    const mod = {
      doc: ref, collection: ref, query: (r: unknown) => r, where: () => null,
      getDoc: async (r: { path: string }) => snap(r.path),
      getDocs: async (r: { path: string }) => {
        const docs = Object.keys(store).filter((k) => k.startsWith(r.path + '/') && !k.slice(r.path.length + 1).includes('/')).map(snap);
        return { docs, empty: !docs.length };
      },
      setDoc: async (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o),
      deleteDoc: async (r: { path: string }) => { delete store[r.path]; },
      writeBatch: () => { const ops: (() => void)[] = []; return { set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => ops.push(() => set(r, d, o)), delete: (r: { path: string }) => ops.push(() => { delete store[r.path]; }), commit: async () => { ops.forEach((f) => f()); } }; },
      runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async (r: { path: string }) => snap(r.path), set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o) })
    };
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1', email: 'me@example.com' };
  });
});

const row = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
const entry = (id: string, row: number, createdAt: number, text: string) => ({ id, anchorNodeId: row, person: 'Me', text, context: '', createdAt });
const stored = (page: Page, id: string) => page.evaluate((id) => JSON.parse(localStorage.getItem('sakura_doc_v1_' + id) || 'null'), id);
const queued = (page: Page) => page.evaluate(() => [...(0, eval)('_syncPushQueue').keys()]);

test('a collision keeps the account\'s copy and adds this device\'s new thread entries, then sends the merged copy up', async ({ page }) => {
  await page.evaluate(async ({ rows, mine, theirs }) => {
    localStorage.setItem('sakura_doc_v1_d2', JSON.stringify({ nodes: rows, title: 'Mine', remarks: [mine] }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd2', title: 'Mine', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    recordDocRevision = async () => true;
    // @ts-expect-error -- bare globals from index.html
    await resolveDocPushConflict(firestoreMods.mod, firestoreMods.db, 'u1', 'd2', { title: 'Theirs', nodes: [{ ...rows[0], text: 'Their words' }], remarks: [theirs], rev: 5, updatedAt: 2 });
  }, { rows: [row(1, 'Plan')], mine: entry('m1', 1, 20, 'Added on the phone'), theirs: entry('t1', 1, 10, 'Added on the Mac') });
  const d = await stored(page, 'd2');
  expect(d.title).toBe('Theirs');
  expect(d.nodes[0].text).toBe('Their words');
  expect(d.remarks.map((r: { id: string }) => r.id)).toEqual(['t1', 'm1']);
  expect(await queued(page)).toContain('doc:d2');
});

test('an entry deleted on the other device is not brought back by the collision', async ({ page }) => {
  await page.evaluate(async ({ rows, mine }) => {
    localStorage.setItem('sakura_doc_v1_d3', JSON.stringify({ nodes: rows, title: 'Mine', remarks: [mine] }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd3', title: 'Mine', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    recordDocRevision = async () => true;
    // @ts-expect-error -- bare globals from index.html
    await resolveDocPushConflict(firestoreMods.mod, firestoreMods.db, 'u1', 'd3', { title: 'Theirs', nodes: rows, remarks: [], remarkTombstones: { m1: Date.now() - 1000 }, rev: 5, updatedAt: 2 });
  }, { rows: [row(1, 'Plan')], mine: entry('m1', 1, 20, 'Deleted on the Mac') });
  expect((await stored(page, 'd3')).remarks).toEqual([]);
  expect(await queued(page)).not.toContain('doc:d3');
});

test('a newer copy arriving for a document not on screen keeps this device\'s new thread entries', async ({ page }) => {
  await page.evaluate(async ({ rows, mine }) => {
    localStorage.setItem('sakura_doc_v1_d4', JSON.stringify({ nodes: rows, title: 'Offline edit', remarks: [mine] }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd4', title: 'Offline edit', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    recordDocRevision = async () => true;
    // @ts-expect-error -- bare globals from index.html
    await applyIncomingDocData(firestoreMods.mod, firestoreMods.db, 'u1', 'd4', { title: 'Newer elsewhere', nodes: [{ ...rows[0], text: 'Other' }], remarks: [], rev: 3, updatedAt: Date.now() }, false);
  }, { rows: [row(1, 'Plan')], mine: entry('m1', 1, 20, 'Typed offline') });
  const d = await stored(page, 'd4');
  expect(d.title).toBe('Newer elsewhere');
  expect(d.remarks.map((r: { id: string }) => r.id)).toEqual(['m1']);
  expect(await queued(page)).toContain('doc:d4');
});

test('deleting a thread entry records it, and the record is saved with the document', async ({ page }) => {
  const t = await page.evaluate((rows) => {
    // @ts-expect-error -- bare globals from index.html
    createDoc(); nodes = rows.map(normalizeNode); remarks = [{ id: 'x1', anchorNodeId: 1, person: 'Me', text: 'Gone soon', context: '', createdAt: 1 }]; nextId = 2; render();
    // @ts-expect-error -- bare globals from index.html
    deleteThread(1); saveToStorage();
    // @ts-expect-error -- bare globals from index.html
    return JSON.parse(localStorage.getItem(docKey(currentDocId))!).remarkTombstones;
  }, [row(1, 'Plan')]);
  expect(Object.keys(t)).toEqual(['x1']);
});
