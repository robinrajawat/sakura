import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cloud-first follow-up (2026-11-13), as other synced apps do it:
// - an edit saved here but never sent (offline, tab closed) goes up the next time the app catches up;
// - "Delete forever" on one device removes the document on the others (a marker in
//   users/{uid}/deletedDocs), unless it was edited there after the delete: then the edit wins.
// Drives the real sync code against an in-memory Firestore stand-in (path -> data).
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

const cloud = (page: Page, p: string) => page.evaluate((p) => (window as unknown as { __cloud: Record<string, Record<string, unknown>> }).__cloud[p], p);
const seedDoc = (page: Page, text: string) => page.evaluate((text) => {
  // @ts-expect-error -- bare globals from index.html
  createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text })]; nextId = 2; dirty = true; saveToStorage();
  // @ts-expect-error -- bare global from index.html
  return currentDocId as string;
}, text);
const pull = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error -- bare globals from index.html
  _syncPushQueue.clear(); await pullAndMergeFromCloud(true); await flushSyncQueue();
});

test('an edit saved here but never sent goes up when the app catches up', async ({ page }) => {
  const id = await seedDoc(page, 'Edited offline');
  // The account still has the older copy, written before this device's last save.
  await page.evaluate((id) => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    w.__cloud['users/u1/docs/' + id] = { title: '', rev: 1, updatedAt: 1, nodes: [{ id: 1, depth: 0, text: 'Older account copy' }] };
    localStorage.setItem('sakura_doc_cloud_rev_v1', JSON.stringify({ [id]: 1 }));
  }, id);
  await pull(page);
  const d = (await cloud(page, 'users/u1/docs/' + id)) as { rev: number; nodes: { text: string }[] };
  expect(d.nodes[0].text).toBe('Edited offline');
  expect(d.rev).toBe(2);
});

test('a document deleted forever on another device goes here too', async ({ page }) => {
  const keep = await seedDoc(page, 'Stays');
  const gone = await seedDoc(page, 'Deleted elsewhere');
  await page.evaluate((gone) => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    w.__cloud['users/u1/deletedDocs/' + gone] = { deletedAt: Date.now() + 60000 };
  }, gone);
  await pull(page);
  const ids = await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    return loadDocsIndex().map((d: { id: string }) => d.id) as string[];
  });
  expect(ids).toContain(keep);
  expect(ids).not.toContain(gone);
  expect(await page.evaluate((g) => localStorage.getItem('sakura_doc_v1_' + g), gone)).toBeNull();
  // It was open here: another document is on screen now, and the message says why.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => currentDocId)).toBe(keep);
  await expect(page.locator('#toast, .toast').filter({ hasText: 'deleted on another device' }).first()).toBeVisible();
  // And it is not sent back up as "missing from the account".
  expect(await cloud(page, 'users/u1/docs/' + gone)).toBeUndefined();
});

test('an edit made here after the delete wins: the document stays and goes back up', async ({ page }) => {
  const id = await seedDoc(page, 'Edited after the delete');
  await page.evaluate((id) => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    w.__cloud['users/u1/deletedDocs/' + id] = { deletedAt: 1 };
  }, id);
  await pull(page);
  expect(await cloud(page, 'users/u1/deletedDocs/' + id)).toBeUndefined();
  const d = (await cloud(page, 'users/u1/docs/' + id)) as { nodes: { text: string }[] };
  expect(d.nodes[0].text).toBe('Edited after the delete');
});

test('Delete forever here leaves the marker for other devices', async ({ page }) => {
  const id = await seedDoc(page, 'To delete');
  await page.evaluate(async (id) => {
    // @ts-expect-error -- bare global from index.html
    permanentlyDeleteDocCore(id);
    await new Promise((r) => setTimeout(r, 50));
  }, id);
  const marker = (await cloud(page, 'users/u1/deletedDocs/' + id)) as { deletedAt: number };
  expect(marker.deletedAt).toBeGreaterThan(0);
});
