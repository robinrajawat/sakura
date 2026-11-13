import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Synced lists and settings merge like other synced apps (src/state/metaMerge.ts): one device moves
// document d1 to a folder while another moves d2, and both moves stay, whichever way the change
// travels. Real sync code against an in-memory Firestore stand-in (same as sync-offline-and-deletes).
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
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} }; currentUser = { uid: 'u1' };
  });
});

const cloudValue = (page: Page, key: string) => page.evaluate((key) => (window as unknown as { __cloud: Record<string, { value: unknown }> }).__cloud['users/u1/meta/' + key]?.value, key);

test.beforeEach(async ({ page }) => {
  await page.evaluate(() => {
    // Both devices last agreed on: d1 and d2 in f1. This device has since moved d1 to f2.
    // @ts-expect-error -- bare globals from index.html
    setMetaBase('docFolderMap', { d1: 'f1', d2: 'f1' }); localStorage.setItem(DOC_FOLDER_KEY, JSON.stringify({ d1: 'f2', d2: 'f1' }));
  });
});

test('taking another device\'s change keeps this device\'s own, and sends the merge back up', async ({ page }) => {
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    const ts = _loadSyncLocalTs(); ts.docFolderMap = 1; _saveSyncLocalTs(ts);
    // @ts-expect-error -- bare global from index.html
    await applyIncomingMetaData('docFolderMap', { value: { d1: 'f1', d2: 'f3' }, updatedAt: Date.now() });
    await new Promise((r) => setTimeout(r, 10));
    // @ts-expect-error -- bare global from index.html
    await flushSyncQueue();
  });
  expect(await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    return loadDocFolderMap();
  })).toEqual({ d1: 'f2', d2: 'f3' });
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f2', d2: 'f3' });
});

test('sending this device\'s change keeps the one another device made since', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as unknown as { __cloud: Record<string, unknown> };
    w.__cloud['users/u1/meta/docFolderMap'] = { value: { d1: 'f1', d2: 'f3' }, updatedAt: 5 };
    // @ts-expect-error -- bare globals from index.html
    await pushMetaToCloud(firestoreMods.mod, firestoreMods.db, 'docFolderMap');
  });
  expect(await cloudValue(page, 'docFolderMap')).toEqual({ d1: 'f2', d2: 'f3' });
  expect(await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    return loadDocFolderMap();
  })).toEqual({ d1: 'f2', d2: 'f3' });
});
