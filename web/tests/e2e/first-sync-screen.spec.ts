import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Signing in on a device shows "Bringing in your documents…" with a count until the account's
// documents are in, then opens the most recently edited one, instead of a blank Untitled document
// (owner 2026-11-21). Same in-memory Firestore stand-in as sync-offline-and-deletes.spec.ts.
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

const putCloudDoc = (page: Page, id: string, title: string, updatedAt: number) => page.evaluate(({ id, title, updatedAt }) => {
  (window as unknown as { __cloud: Record<string, unknown> }).__cloud['users/u1/docs/' + id] =
    { title, nextId: 2, nodes: [{ id: 1, depth: 0, text: title + ' row' }], updatedAt, rev: 1 };
}, { id, title, updatedAt });
const signInAndSync = (page: Page) => page.evaluate(async () => {
  // @ts-expect-error -- bare globals from index.html
  startFirstSync(); await pullAndMergeFromCloud(true);
});

test('the screen shows while the account is read, then the newest document opens in place of a blank one', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    createDoc();
  });
  await putCloudDoc(page, 'dOld', 'Older plan', 1000);
  await putCloudDoc(page, 'dNew', 'Newest plan', 2000);
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    startFirstSync();
  });
  await expect(page.locator('#first-sync-msg')).toHaveText('Bringing in your documents…');
  await expect(page.locator('#first-sync .first-sync-card')).toBeVisible();
  // The app behind can't be reached with Tab while it shows.
  await expect(page.locator('#editor-pane')).not.toBeFocused();
  expect(await page.evaluate(() => document.getElementById('editor-pane')!.closest('[inert]') !== null)).toBe(true);
  await page.evaluate(async () => {
    // @ts-expect-error -- bare global from index.html
    await pullAndMergeFromCloud(true);
  });
  await expect(page.locator('#first-sync')).toBeHidden();
  await expect(page.locator('#header-title')).toHaveValue('Newest plan');
  expect(await page.evaluate(() => document.querySelectorAll('[data-first-sync-inert]').length)).toBe(0);
  await expect(page.locator('#editor-pane')).toContainText('Newest plan row');
});

test('a document with something in it stays open', async ({ page }) => {
  const mine = await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'Mine' })]; nextId = 2; dirty = true; saveToStorage(); render();
    // @ts-expect-error -- bare global from index.html
    return currentDocId as string;
  });
  await putCloudDoc(page, 'dNew', 'Newest plan', 2000);
  await signInAndSync(page);
  await expect(page.locator('#first-sync')).toBeHidden();
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => currentDocId)).toBe(mine);
  await expect(page.locator('#editor-pane')).toContainText('Mine');
});

test('it counts the documents as they come in', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    startFirstSync(); firstSyncProgress(1, 3);
  });
  await expect(page.locator('#first-sync-detail')).toHaveText('1 of 3 documents');
  await expect(page.locator('#first-sync-bar-fill')).toHaveAttribute('style', /width: 33%/);
});

test('when nothing moves for a while it says so and lets you carry on', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    startFirstSync(); _firstSync.lastProgressAt = Date.now() - 13000; renderFirstSync();
  });
  await expect(page.locator('#first-sync')).toHaveAttribute('data-stage', 'stalled');
  await expect(page.locator('#first-sync-continue')).toHaveText('Continue without waiting');
  await page.locator('#first-sync-continue').click();
  await expect(page.locator('#first-sync')).toBeHidden();
});

test('a failed sync says so, with Retry and Continue; Retry brings the documents in', async ({ page }) => {
  await putCloudDoc(page, 'dNew', 'Newest plan', 2000);
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    const real = firestoreMods; firestoreMods = null; (window as unknown as { __real: unknown }).__real = real;
    // @ts-expect-error -- bare globals from index.html
    loadFirestoreMods = async () => { if (!firestoreMods) throw new Error('network'); return firestoreMods; };
    // @ts-expect-error -- bare globals from index.html
    startFirstSync(); await pullAndMergeFromCloud(true);
  });
  await expect(page.locator('#first-sync-msg')).toHaveText('Couldn’t bring in your documents.');
  await expect(page.locator('#first-sync-retry')).toBeVisible();
  await expect(page.locator('#first-sync-continue')).toHaveText('Continue');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    firestoreMods = (window as unknown as { __real: unknown }).__real;
  });
  await page.locator('#first-sync-retry').click();
  await expect(page.locator('#first-sync')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('sakura_doc_v1_dNew'))).not.toBeNull();
});

test('a document arriving does not blink the screen (owner 2026-11-21)', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    startFirstSync(); _firstSync.startedAt = Date.now() - 2000; firstSyncProgress(1, 40);
  });
  // Straight after a document arrives the card stays shown (it used to hide for 300 ms each time).
  expect(await page.evaluate(() => document.getElementById('first-sync')!.dataset.stage)).toBe('loading');
  await expect(page.locator('#first-sync .first-sync-card')).toBeVisible();
  await expect(page.locator('#first-sync-detail')).toHaveText('1 of 40 documents');
});

test('at the very start it still waits a moment before showing', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    startFirstSync();
  });
  expect(await page.evaluate(() => document.getElementById('first-sync')!.dataset.stage)).toBe('quiet');
  await expect(page.locator('#first-sync')).toHaveAttribute('data-stage', 'loading');
});
