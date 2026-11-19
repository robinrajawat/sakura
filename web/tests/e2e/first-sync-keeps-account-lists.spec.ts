import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-19: after clearing website data on an iPhone and signing in again, every document
// showed as Unfiled; the folders were still there. A device's first sync has no record of what it
// last agreed with the account, and it took "newer timestamp wins": a routine local save made
// before that first sync (clearing away a blank document re-saves the folder links) looked newer
// than the account's links, so the account's copy was ignored and the empty one sent up over it.
// A first sync must combine the two, never replace the account's copy (the usual rule in synced
// apps). Real sync code against an in-memory Firestore stand-in (as meta-merge.spec.ts).

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
      doc: ref, collection: ref,
      getDoc: async (r: { path: string }) => snap(r.path),
      getDocs: async (r: { path: string }) => {
        const docs = Object.keys(store).filter((k) => k.startsWith(r.path + '/') && !k.slice(r.path.length + 1).includes('/')).map(snap);
        return { docs, empty: !docs.length };
      },
      setDoc: async (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o),
      deleteDoc: async (r: { path: string }) => { delete store[r.path]; },
      writeBatch: () => ({ set: () => {}, delete: (r: { path: string }) => { delete store[r.path]; }, commit: async () => {} }),
      runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: async (r: { path: string }) => snap(r.path), set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o) })
    };
    // The account, as the owner's other devices left it an hour ago.
    const hourAgo = Date.now() - 3600_000;
    store['users/u1/meta/folders'] = { value: [{ id: 'f1', name: 'Clients', open: true, parentId: null }], updatedAt: hourAgo };
    store['users/u1/meta/docFolderMap'] = { value: { d1: 'f1', d2: 'f1' }, updatedAt: hourAgo };
    store['users/u1/meta/docOrder'] = { value: { d1: 0, d2: 1 }, updatedAt: hourAgo };
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1' };
  });
});

const cloudValue = (page: Page, key: string) => page.evaluate((key) => (window as unknown as { __cloud: Record<string, { value: unknown }> }).__cloud['users/u1/meta/' + key]?.value, key);
const firstSync = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error -- bare globals from index.html
  _syncPushQueue.clear(); await pullAndMergeFromCloud(true); await flushSyncQueue();
  // A merge that holds more than the account's copy is sent back up on the next tick.
  await new Promise((r) => setTimeout(r, 20));
  // @ts-expect-error -- bare globals from index.html
  await flushSyncQueue();
});

test('a cleared device that saved its (empty) folder links before its first sync keeps the account\'s links', async ({ page }) => {
  await page.evaluate(() => {
    // A cleared browser: nothing agreed with the account yet. A blank document is cleared away
    // before the first sync, which re-saves the (empty) folder links and document order.
    // @ts-expect-error -- bare globals from index.html
    localStorage.removeItem(SYNC_META_BASE_KEY); saveDocFolderMap({}); saveDocOrderMap({});
  });
  await firstSync(page);
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f1', d2: 'f1' });
  expect(await cloudValue(page, 'docOrder')).toEqual({ d1: 0, d2: 1 });
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => loadDocFolderMap())).toEqual({ d1: 'f1', d2: 'f1' });
});

test('a document filed on the device before its first sync is kept alongside the account\'s links', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    localStorage.removeItem(SYNC_META_BASE_KEY); saveDocFolderMap({ d9: 'f1' });
  });
  await firstSync(page);
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f1', d2: 'f1', d9: 'f1' });
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => loadDocFolderMap())).toEqual({ d1: 'f1', d2: 'f1', d9: 'f1' });
});

test('the first push (before any pull) combines with the account instead of writing over it', async ({ page }) => {
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    localStorage.removeItem(SYNC_META_BASE_KEY); localStorage.setItem(DOC_FOLDER_KEY, '{}');
    // @ts-expect-error -- bare globals from index.html
    await pushMetaToCloud(firestoreMods.mod, firestoreMods.db, 'docFolderMap');
  });
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f1', d2: 'f1' });
});

test('after the first sync, removing a link on purpose still syncs as a removal', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    localStorage.removeItem(SYNC_META_BASE_KEY);
  });
  await firstSync(page);
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    setFolderForDoc('d2', null); await new Promise((r) => setTimeout(r, 10)); await flushSyncQueue();
  });
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f1' });
});
