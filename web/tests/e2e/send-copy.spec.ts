import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Share → Send a copy (owner 2026-10-30): the sender writes a snapshot into the recipient's
// copies inbox plus a doc_copy notification; the recipient's click adds it as their own document.
// Firestore is replaced by an in-memory store keyed by path.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
    const store: Record<string, Record<string, unknown>> = {};
    let n = 0;
    const mod = {
      collection: (_db: unknown, ...p: string[]) => p.join('/'),
      doc: (_db: unknown, ...p: string[]) => p.join('/'),
      addDoc: async (col: string, data: Record<string, unknown>) => { const id = 'id' + (++n); store[col + '/' + id] = data; return { id }; },
      getDoc: async (ref: string) => ({ exists: () => ref in store, data: () => store[ref] }),
      deleteDoc: async (ref: string) => { delete store[ref]; },
      updateDoc: async (ref: string, data: Record<string, unknown>) => { store[ref] = { ...store[ref], ...data }; }
    };
    // @ts-expect-error -- test hook
    window.__store = store;
    // @ts-expect-error -- bare globals from index.html
    loadFirestoreMods = async () => ({ mod, db: {} });
  });
});

test('a sent copy becomes the recipient\'s own document and leaves the inbox', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'alice', displayName: 'Alice', email: 'alice@example.com' };
    // @ts-expect-error
    ensureDocumentForEditing(); el('header-title').value = 'Plan'; el('header-title').dispatchEvent(new Event('input'));
    // @ts-expect-error
    nodes = [{ id: 1, depth: 0, text: 'Pricing', parentId: null, isCheckbox: false, checked: false, note: 'why', tags: [], styles: {}, tables: [] }]; nextId = 2; markDirty(); saveToStorage();
    // @ts-expect-error
    const sourceId = currentDocId;
    // @ts-expect-error
    const sent = await sendDocCopy(sourceId, 'Plan', { uid: 'bob', displayName: 'Bob' });
    // @ts-expect-error
    const store = window.__store as Record<string, Record<string, unknown>>;
    const notif = Object.entries(store).find(([k]) => k.startsWith('notifications/bob/items/'))![1];
    // @ts-expect-error
    currentUser = { uid: 'bob', displayName: 'Bob' };
    const notifId = Object.keys(store).find((k) => k.startsWith('notifications/bob/items/'))!.split('/').pop();
    // @ts-expect-error
    await addSentCopyToMyDocs({ ...notif, id: notifId });
    const stored = store['notifications/bob/items/' + notifId];
    const addedId = stored.addedDocId as string;
    // @ts-expect-error
    switchDoc(addedId);
    return {
      sent, notifType: notif.type, notifTitle: notif.docTitle, notifRead: stored.read,
      addedId, sourceId,
      // @ts-expect-error
      title: el('header-title').value,
      // @ts-expect-error
      rows: nodes.map((x) => [x.text, x.note]),
      // @ts-expect-error
      inIndex: loadDocsIndex().some((d) => d.id === addedId),
      copiesLeft: Object.keys(store).filter((k) => k.startsWith('copies/')).length
    };
  });
  expect(r.sent).toEqual({ ok: true });
  expect(r.notifType).toBe('doc_copy');
  expect(r.notifTitle).toBe('Plan');
  expect(r.notifRead).toBe(true);
  expect(r.addedId).not.toBe(r.sourceId);
  expect(r.title).toBe('Plan');
  expect(r.rows).toEqual([['Pricing', 'why']]);
  expect(r.inIndex).toBe(true);
  expect(r.copiesLeft).toBe(0);
});

test('a document too large to send says so and sends nothing', async ({ page }) => {
  const r = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'alice' };
    // @ts-expect-error
    ensureDocumentForEditing();
    // @ts-expect-error
    nodes = [{ id: 1, depth: 0, text: 'x'.repeat(950000), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [] }]; nextId = 2; markDirty(); saveToStorage();
    // @ts-expect-error
    const res = await sendDocCopy(currentDocId, 'Big', { uid: 'bob' });
    // @ts-expect-error
    return { res, writes: Object.keys(window.__store).length };
  });
  expect(r.res.ok).toBe(false);
  expect(r.res.error).toMatch(/too large/);
  expect(r.writes).toBe(0);
});

test('you cannot send a copy to yourself', async ({ page }) => {
  const res = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'alice' }; ensureDocumentForEditing();
    // @ts-expect-error
    return sendDocCopy(currentDocId, 'Plan', { uid: 'alice' });
  });
  expect(res.ok).toBe(false);
});

test('the bell shows Add and Decline for a sent copy; clicking the text adds nothing; Add then offers Open', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    const store = window.__store as Record<string, Record<string, unknown>>;
    store['copies/bob/items/c1'] = { title: 'Plan', doc: JSON.stringify({ title: 'Plan', nodes: [{ id: 1, depth: 0, text: 'Pricing' }], nextId: 2 }) };
    // @ts-expect-error
    currentUser = { uid: 'bob' };
    // @ts-expect-error
    notifItems = [{ id: 'n1', type: 'doc_copy', fromDisplayName: 'Robin', docTitle: 'Plan', docId: 'c1', createdAt: Date.now(), read: false }];
    // @ts-expect-error
    toggleNotifMenu(true); renderNotifList();
  });
  const item = page.locator('#notif-list .notif-item').first();
  await expect(item.locator('.notif-item-text')).toHaveText('Robin sent you a copy of Plan');
  await expect(item.locator('.notif-item-meta')).toContainText('Not in your documents until you add it');
  await expect(item.locator('.notif-copy-btn')).toHaveText(['Add to my documents', 'Decline']);
  await expect(item.locator('.notif-item-dismiss')).toHaveCount(0);
  const before = await page.evaluate(() => (window as unknown as { loadDocsIndex: () => unknown[] }).loadDocsIndex().length);
  await item.locator('.notif-item-text').click();
  expect(await page.evaluate(() => (window as unknown as { loadDocsIndex: () => unknown[] }).loadDocsIndex().length)).toBe(before);
  await item.locator('.notif-copy-btn.primary').click();
  await expect(page.locator('#notif-list .notif-item').first().locator('.notif-item-text')).toHaveText('Added Plan to your documents');
  await expect(page.locator('#notif-list .notif-item').first().locator('.notif-copy-btn')).toHaveText(['Open']);
  await page.locator('#notif-list .notif-copy-btn').click();
  await expect(page.locator('#header-title')).toHaveValue('Plan');
});

test('Decline deletes the sent copy', async ({ page }) => {
  const left = await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    const store = window.__store as Record<string, Record<string, unknown>>;
    store['copies/bob/items/c1'] = { title: 'Plan', doc: '{}' };
    store['notifications/bob/items/n1'] = { type: 'doc_copy', docId: 'c1' };
    // @ts-expect-error
    currentUser = { uid: 'bob' };
    // @ts-expect-error
    notifItems = [{ id: 'n1', type: 'doc_copy', docTitle: 'Plan', docId: 'c1', createdAt: Date.now(), read: false }];
    // @ts-expect-error
    toggleNotifMenu(true); renderNotifList();
    (document.querySelectorAll('#notif-list .notif-copy-btn')[1] as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    return Object.keys(store);
  });
  expect(left).toEqual([]);
});
