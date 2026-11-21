import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Another device's changes to the open document come in live, as in Google Docs or Notion (owner
// 2026-11-21: "we have to be absolutely sure that there are no bugs in this auto merging").

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

// An open document with rows A, B, C whose shared copy (rev 3) is known; returns its id.
async function openShared(page: Page, withBase = true) {
  return page.evaluate(async ({ rows, withBase }) => {
    createDoc(); setDocTitleField('Plan');
    nodes = rows.map(normalizeNode); rebuildParentIds(); nextId = 4; remarks = []; editingId = null;
    setSingleSelection(2); render(); saveToStorage();
    const stored = JSON.parse(localStorage.getItem(docKey(currentDocId)));
    if (withBase) setDocBase(currentDocId, 3, stored); else setDocBaseRev(currentDocId, 3);
    saveDocsIndex([{ id: currentDocId, title: 'Plan', updatedAt: 1 }]);
    await new Promise((r) => setTimeout(r, 150));
    _syncPushQueue.clear();
    return currentDocId;
  }, { rows: [row(1, 'A'), row(2, 'B'), row(3, 'C')], withBase });
}
const incoming = (page: Page, id: string, rows: ReturnType<typeof row>[]) => page.evaluate(async ({ id, rows }) => {
  let versions = 0; const real = recordDocRevision; recordDocRevision = async (...a) => { versions++; return real(...a); };
  const applied = await applyIncomingDocData(firestoreMods.mod, firestoreMods.db, 'u1', id, { nodes: rows, nextId: 10, title: 'Plan', remarks: [], rev: 4, updatedAt: Date.now() + 5000, lastDevice: 'Safari on Mac' }, true);
  recordDocRevision = real;
  return { applied, versions, texts: nodes.map((n) => n.text), banner: crossTabWarningDocId === id && !!document.querySelector('#cross-tab-banner:not([hidden])'), queued: _syncPushQueue.has('doc:' + id), selected: selectedId, pendingRev: _incomingDocRev[id] };
}, { id, rows });

test('nothing being typed: the other device\'s changes appear at once, glowing, with nothing set aside', async ({ page }) => {
  const id = await openShared(page);
  const r = await incoming(page, id, [row(1, 'A'), row(2, 'B, edited on the Mac'), row(3, 'C'), row(4, 'D from the Mac')]);
  expect(r.applied).toBe(true);
  expect(r.texts).toEqual(['A', 'B, edited on the Mac', 'C', 'D from the Mac']);
  expect(r.versions).toBe(0);
  expect(r.banner).toBe(false);
  expect(r.selected).toBe(2); // where you were stays
  expect(r.queued).toBe(false); // nothing of this device's to send
  await expect(page.locator('#editor-pane .row-updated')).toHaveCount(2);
  await expect(page.locator('#toast')).toContainText('Updated from Safari on Mac');
  // The stored copy is the merged one and the shared copy moved on, so the next save doesn't collide.
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(docKey(id))).nodes.map((n) => n.text), id)).toEqual(r.texts);
  expect(await page.evaluate((id) => getDocBaseRev(id), id)).toBe(4);
});

test('typing here: nothing changes under the caret, no banner; the next save merges', async ({ page }) => {
  const id = await openShared(page);
  await page.evaluate(() => { beginEdit(1, true); });
  const r = await incoming(page, id, [row(1, 'A'), row(2, 'B, edited on the Mac'), row(3, 'C')]);
  expect(r.texts).toEqual(['A', 'B', 'C']);
  expect(r.banner).toBe(false);
  expect(r.pendingRev).toBe(4); // this copy's next push is refused and merges
  expect(r.versions).toBe(0);
});

test('unsent changes here to another row: both kept, and this device\'s change goes up', async ({ page }) => {
  const id = await openShared(page);
  await page.evaluate(() => { nodes[0].text = 'A, edited here'; markDirty(); saveToStorage(); _syncPushQueue.clear(); });
  const r = await incoming(page, id, [row(1, 'A'), row(2, 'B, edited on the Mac'), row(3, 'C')]);
  expect(r.applied).toBe(true);
  expect(r.texts).toEqual(['A, edited here', 'B, edited on the Mac', 'C']);
  expect(r.versions).toBe(0);
  expect(r.queued).toBe(true);
});

test('the same row changed on both: the account\'s is kept and this device\'s copy goes to Version history', async ({ page }) => {
  const id = await openShared(page);
  await page.evaluate(() => { nodes[1].text = 'B, edited here'; markDirty(); saveToStorage(); _syncPushQueue.clear(); });
  const r = await incoming(page, id, [row(1, 'A'), row(2, 'B, edited on the Mac'), row(3, 'C')]);
  expect(r.applied).toBe(true);
  expect(r.texts).toEqual(['A', 'B, edited on the Mac', 'C']);
  expect(r.versions).toBe(1);
  await expect(page.locator('#toast')).toContainText('yours is in Version history');
});

test('no shared copy known (synced before this change): the banner, as before', async ({ page }) => {
  const id = await openShared(page, false);
  const r = await incoming(page, id, [row(1, 'A'), row(2, 'B, edited on the Mac'), row(3, 'C')]);
  expect(r.texts).toEqual(['A', 'B', 'C']);
  expect(r.pendingRev).toBe(4);
  expect(await page.evaluate((id) => crossTabWarningDocId === id, id)).toBe(true);
});

test('two copies arriving together are applied in turn, and an older one arriving late is ignored', async ({ page }) => {
  const id = await openShared(page);
  const r = await page.evaluate(async (id) => {
    const send = (rev, rows) => applyIncomingDocData(firestoreMods.mod, firestoreMods.db, 'u1', id, { nodes: rows, nextId: 10, title: 'Plan', remarks: [], rev, updatedAt: Date.now() + 5000 + rev, lastDevice: 'Safari on Mac' }, true);
    const n = (i, t) => ({ id: i, depth: 0, text: t, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    await Promise.all([
      send(4, [n(1, 'A'), n(2, 'B4'), n(3, 'C')]),
      send(5, [n(1, 'A'), n(2, 'B4'), n(3, 'C5')])
    ]);
    await send(4, [n(1, 'A'), n(2, 'B4'), n(3, 'C')]); // late, older
    return { texts: nodes.map((x) => x.text), rev: getDocBaseRev(id), stored: JSON.parse(localStorage.getItem(docKey(id))).nodes.map((x) => x.text), banner: crossTabWarningDocId === id };
  }, id);
  expect(r.texts).toEqual(['A', 'B4', 'C5']);
  expect(r.stored).toEqual(['A', 'B4', 'C5']);
  expect(r.rev).toBe(5);
  expect(r.banner).toBe(false);
});
