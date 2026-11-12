import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cloud-first Phase 1 (docs/cloud-first-plan.md): a push only replaces the cloud copy when the
// cloud is still at the rev this device's copy is based on. Drives the real pushDocToCloud
// against a small in-memory Firestore stand-in (paths -> data), signed in as a fake account.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const store: Record<string, Record<string, unknown>> = {};
    const w = window as unknown as { __cloud: typeof store };
    w.__cloud = store;
    const ref = (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') });
    const snap = (p: string) => ({ exists: () => p in store, data: () => (p in store ? { ...store[p] } : undefined) });
    const set = (r: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      store[r.path] = opts && opts.merge ? { ...(store[r.path] || {}), ...data } : { ...data };
    };
    const mod = {
      doc: ref,
      collection: ref,
      getDoc: async (r: { path: string }) => snap(r.path),
      getDocs: async () => ({ docs: [], empty: true }),
      setDoc: async (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o),
      deleteDoc: async (r: { path: string }) => { delete store[r.path]; },
      writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
      runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ get: async (r: { path: string }) => snap(r.path), set: (r: { path: string }, d: Record<string, unknown>, o?: { merge?: boolean }) => set(r, d, o) })
    };
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = { mod, db: {} };
    // @ts-expect-error
    currentUser = { uid: 'u1', email: 'a@example.com' };
    // @ts-expect-error
    createDoc();
    // @ts-expect-error
    nodes = [{ id: 1, depth: 0, text: 'Written on this device' }]; nextId = 2; dirty = true; saveToStorage();
  });
});

const push = (page: import('@playwright/test').Page) =>
  page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    await pushDocToCloud(firestoreMods.mod, firestoreMods.db, currentDocId);
  });
const cloudDoc = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    // @ts-expect-error -- bare global from index.html
    return w.__cloud['users/u1/docs/' + currentDocId] as { rev: number; nodes: { text: string }[] };
  });

test('each push from the device that saved last goes through, one rev at a time', async ({ page }) => {
  await push(page);
  expect((await cloudDoc(page)).rev).toBe(1);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].text = 'Edited again'; dirty = true; saveToStorage();
  });
  await push(page);
  const d = await cloudDoc(page);
  expect(d.rev).toBe(2);
  expect(d.nodes[0].text).toBe('Edited again');
});

test('a copy based on an older rev never overwrites another device\'s save', async ({ page }) => {
  await push(page);
  // Another device saves (rev 2) while this one still has rev 1, then this one edits.
  await page.evaluate(() => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    // @ts-expect-error -- bare global from index.html
    const p = 'users/u1/docs/' + currentDocId;
    w.__cloud[p] = { ...w.__cloud[p], rev: 2, updatedAt: Date.now() + 1000, nodes: [{ id: 1, depth: 0, text: 'Written on the other device' }] };
    // @ts-expect-error -- bare globals from index.html
    nodes[0].text = 'Stale edit here'; dirty = true; saveToStorage();
  });
  await push(page);
  const d = await cloudDoc(page);
  expect(d.rev).toBe(2);
  expect(d.nodes[0].text).toBe('Written on the other device');
  // The other device's copy is now on screen, and this device's edit is a version.
  await expect(page.locator('#editor-pane')).toContainText('Written on the other device');
  await expect(page.locator('#toast, .toast').filter({ hasText: 'changed on another device' }).first()).toBeVisible();
  const reasons = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    const list = await loadDocRevisions(currentDocId);
    return (list as { reason: string }[]).map((r) => r.reason);
  });
  expect(reasons).toContain('Your changes on this device');
  // And from here on this device's saves go through again.
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes[0].text = 'Next edit'; dirty = true; saveToStorage();
  });
  await push(page);
  expect((await cloudDoc(page)).rev).toBe(3);
});

test('migration: the open document never saves over another device\'s copy it has not shown yet', async ({ page }) => {
  await push(page);
  await page.evaluate(() => {
    const w = window as unknown as { __cloud: Record<string, Record<string, unknown>> };
    // @ts-expect-error -- bare global from index.html
    const id = currentDocId;
    // No remembered rev yet (a device from before revs), and another device's copy arrived for
    // the open document (stored, banner shown, screen not reloaded).
    localStorage.removeItem('sakura_doc_cloud_rev_v1');
    w.__cloud['users/u1/docs/' + id] = { ...w.__cloud['users/u1/docs/' + id], rev: 2, updatedAt: 1, nodes: [{ id: 1, depth: 0, text: 'Written on the other device' }] };
    // @ts-expect-error -- bare global from index.html
    _incomingDocRev[id] = 2;
    // @ts-expect-error -- bare globals from index.html
    nodes[0].text = 'Older screen copy'; dirty = true; saveToStorage();
  });
  await push(page);
  expect((await cloudDoc(page)).nodes[0].text).toBe('Written on the other device');
});
