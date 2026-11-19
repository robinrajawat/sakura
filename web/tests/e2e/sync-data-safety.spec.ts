import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Data-safety audit (owner 2026-11-19, after documents showed as Unfiled on a cleared iPhone): every
// way sync could lose or mix real content, each pinned by a test. The rule throughout: when in doubt,
// nothing is sent and nothing is deleted, so the worst case is a change syncing late, never lost.
// Real sync code against an in-memory Firestore stand-in (as meta-merge.spec.ts).

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

const cloud = (page: Page, p: string) => page.evaluate((p) => (window as unknown as { __cloud: Record<string, Record<string, unknown>> }).__cloud[p], p);
const row = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });

test('a diagram this device can\'t read is not sent to the account as empty; one it can read is', async ({ page }) => {
  await page.evaluate((rows) => {
    const w = window as unknown as { __cloud: Record<string, unknown> };
    w.__cloud['users/u1/docs/d1/diagrams/g1'] = { xml: '<mxfile>real</mxfile>', updatedAt: 1 };
    localStorage.setItem('sakura_doc_v1_d1', JSON.stringify({ nodes: rows, title: 'Plan', diagrams: [
      { id: 'g1', title: 'Unreadable here', blobSynced: true, modifiedAt: 1 },
      { id: 'g2', title: 'Readable here', blobSynced: true, modifiedAt: 1 }
    ] }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd1', title: 'Plan', updatedAt: Date.now() }]);
    // This device's store fails for g1 (the iPhone case) and holds g2.
    // @ts-expect-error -- bare globals from index.html
    idbGet = async (k: string) => { if (k.endsWith(':g1')) throw new Error('Connection to Indexed Database server lost'); return { xml: '<mxfile>g2</mxfile>' }; };
  }, [row(1, 'A row')]);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => pushDocToCloud(firestoreMods.mod, firestoreMods.db, 'd1'));
  expect((await cloud(page, 'users/u1/docs/d1/diagrams/g1'))?.xml).toBe('<mxfile>real</mxfile>');
  expect((await cloud(page, 'users/u1/docs/d1/diagrams/g2'))?.xml).toBe('<mxfile>g2</mxfile>');
  expect((await cloud(page, 'users/u1/docs/d1'))?.title).toBe('Plan');
});

test('a blank document cleared away is not deleted from the account when another device has written in it since', async ({ page }) => {
  const setup = (rev: number) => page.evaluate(({ rev, rows }) => {
    const w = window as unknown as { __cloud: Record<string, unknown> };
    w.__cloud['users/u1/docs/d1'] = { title: 'Filled on the phone', nodes: rows, rev, updatedAt: Date.now() };
    localStorage.setItem('sakura_doc_v1_d1', JSON.stringify({ nodes: [{ ...rows[0], text: '' }], title: '' }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd1', title: 'Untitled', updatedAt: 1 }]); setDocBaseRev('d1', 1);
  }, { rev, rows: [row(1, 'Real words')] });
  const discard = () => page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    pullAndMergeFromCloud = async () => {};
    // @ts-expect-error -- bare globals from index.html
    discardDocIfBlank('d1'); await new Promise((r) => setTimeout(r, 50));
  });
  // Another device wrote rev 2 after this device's rev 1: left in the account.
  await setup(2); await discard();
  expect(await cloud(page, 'users/u1/docs/d1')).toBeTruthy();
  expect(await cloud(page, 'users/u1/deletedDocs/d1')).toBeUndefined();
  // Unchanged since this device's copy: removed as before.
  await setup(1); await discard();
  expect(await cloud(page, 'users/u1/docs/d1')).toBeUndefined();
  expect(await cloud(page, 'users/u1/deletedDocs/d1')).toBeTruthy();
});

test('when two devices edited a document, this device\'s copy is replaced only once its edits are kept as a version', async ({ page }) => {
  const run = (kept: boolean) => page.evaluate(async ({ kept, rows }) => {
    localStorage.setItem('sakura_doc_v1_d2', JSON.stringify({ nodes: rows, title: 'Mine' }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd2', title: 'Mine', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    recordDocRevision = async () => kept;
    // @ts-expect-error -- bare globals from index.html
    await resolveDocPushConflict(firestoreMods.mod, firestoreMods.db, 'u1', 'd2', { title: 'Theirs', nodes: [{ ...rows[0], text: 'Their words' }], rev: 5, updatedAt: 2 });
    return JSON.parse(localStorage.getItem('sakura_doc_v1_d2')!).title;
  }, { kept, rows: [row(1, 'My unsent words')] });
  expect(await run(false)).toBe('Mine');
  expect(await run(true)).toBe('Theirs');
});

test('a newer copy from the account replaces this device\'s different copy only once that copy is kept', async ({ page }) => {
  const r = await page.evaluate(async (rows) => {
    localStorage.setItem('sakura_doc_v1_d3', JSON.stringify({ nodes: rows, title: 'Offline edit' }));
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'd3', title: 'Offline edit', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    recordDocRevision = async () => false;
    // @ts-expect-error -- bare globals from index.html
    const applied = await applyIncomingDocData(firestoreMods.mod, firestoreMods.db, 'u1', 'd3', { title: 'Newer elsewhere', nodes: [{ ...rows[0], text: 'Other' }], rev: 3, updatedAt: Date.now() }, false);
    return { applied, title: JSON.parse(localStorage.getItem('sakura_doc_v1_d3')!).title };
  }, [row(1, 'Typed offline')]);
  expect(r).toEqual({ applied: false, title: 'Offline edit' });
});

test('a synced list missing on this device is never sent up as empty', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as unknown as { __cloud: Record<string, unknown> };
    w.__cloud['users/u1/meta/docFolderMap'] = { value: { d1: 'f1' }, updatedAt: 1 };
    // A device that has synced before (so the first-sync merge doesn't apply), whose copy is gone.
    // @ts-expect-error -- bare globals from index.html
    setMetaBase('docFolderMap', { d1: 'f1' }); localStorage.removeItem(DOC_FOLDER_KEY);
    // @ts-expect-error -- bare globals from index.html
    await pushMetaToCloud(firestoreMods.mod, firestoreMods.db, 'docFolderMap');
  });
  expect((await cloud(page, 'users/u1/meta/docFolderMap'))?.value).toEqual({ d1: 'f1' });
});

test('signing in to a different account never merges the documents this device holds for another; the person chooses', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = null;
    // @ts-expect-error -- bare globals from index.html
    saveDocsIndex([{ id: 'dA', title: 'Account A notes', updatedAt: 1 }]);
    // @ts-expect-error -- bare globals from index.html
    localStorage.setItem(DATA_OWNER_KEY, JSON.stringify({ uid: 'a', email: 'a@example.com' }));
    // @ts-expect-error -- bare globals from index.html
    updateAccountUI({ uid: 'b', email: 'b@example.com' });
  });
  // Nothing syncs: the app isn't signed in as b while the question is open.
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => currentUser)).toBeNull();
  await expect(page.locator('#sakura-modal-title')).toHaveText('This device has another account’s documents');
  await expect(page.locator('#sakura-modal-body')).toContainText('a@example.com');
  // The same account, or a device holding no account's documents, carries on as before.
  const r = await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    updateAccountUI({ uid: 'a', email: 'a@example.com' }); const sameOk = currentUser?.uid;
    // @ts-expect-error -- bare globals from index.html
    localStorage.removeItem(DATA_OWNER_KEY); updateAccountUI({ uid: 'c', email: 'c@example.com' });
    // @ts-expect-error -- bare globals from index.html
    return { sameOk, firstOk: currentUser?.uid, owner: JSON.parse(localStorage.getItem(DATA_OWNER_KEY)).uid };
  });
  expect(r).toEqual({ sameOk: 'a', firstOk: 'c', owner: 'c' });
});
