import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Deleting the account erases everything it has in the cloud (owner 2026-11-17, for the privacy
// policy; GDPR's right to erasure). Firestore keeps a document's records (version history,
// diagrams, previews) when the document itself is deleted, and the profile, notifications and
// received copies live outside users/{uid}; before this, all of those stayed behind. The account is
// a small in-page stand-in for Firestore with the calls the app uses.

async function open(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof deleteAccountCloudData === "function"')).toBe(true);
  await page.evaluate(`
    window.__store = new Map(); window.__failPrefix = '';
    const fail = (p) => window.__failPrefix && p.startsWith(window.__failPrefix);
    const fake = {
      collection: (db, ...p) => ({ path: p.join('/') }),
      doc: (db, ...p) => ({ path: p.join('/') }),
      getDocs: async (col) => {
        const docs = [...window.__store.keys()].filter((p) => p.startsWith(col.path + '/') && !p.slice(col.path.length + 1).includes('/'))
          .map((p) => ({ id: p.slice(col.path.length + 1), ref: { path: p } }));
        return { empty: !docs.length, docs };
      },
      deleteDoc: async (ref) => { if (fail(ref.path)) throw new Error('denied'); window.__store.delete(ref.path); },
      writeBatch: () => { const del = []; return { delete: (ref) => del.push(ref.path), commit: async () => { if (del.some(fail)) throw new Error('denied'); del.forEach((p) => window.__store.delete(p)); } }; },
    };
    firestoreMods = { mod: fake, db: {} };
    const put = (p) => window.__store.set(p, {});
    // u1's account, as the app leaves it after a while of use.
    ['users/u1', 'users/u1/docs/d1', 'users/u1/docs/d2', 'users/u1/docs/d1/versions/100', 'users/u1/docs/d1/versions/100~1',
     'users/u1/docs/d1/diagrams/g1', 'users/u1/docs/d2/previews/p1', 'users/u1/docs/d2/attachments/a1',
     'users/u1/templates/t1', 'users/u1/meta/prefs', 'users/u1/deletedDocs/d9', 'profiles/u1',
     'notifications/u1/items/n1', 'copies/u1/items/c1'].forEach(put);
    // Someone else's account: must not be touched.
    ['users/u2/docs/d1', 'users/u2/docs/d1/versions/1', 'profiles/u2', 'copies/u2/items/c1'].forEach(put);
    // Over one batch's worth of versions.
    for (let i = 0; i < 450; i++) put('users/u1/docs/d2/versions/' + i);
  `);
}
const left = (page: Page) => page.evaluate(`[...window.__store.keys()].sort()`) as Promise<string[]>;
const others = ['copies/u2/items/c1', 'profiles/u2', 'users/u2/docs/d1', 'users/u2/docs/d1/versions/1'];

test('removes every record the account has, and nobody else\'s', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(`deleteAccountCloudData('u1')`)).toBe(0);
  expect(await left(page)).toEqual(others);
});

test('if something can\'t be removed, it says so and the sign-in account is kept to try again', async ({ page }) => {
  await open(page);
  await page.evaluate(`window.__failPrefix = 'profiles/u1'`);
  expect(await page.evaluate(`deleteAccountCloudData('u1')`)).toBe(1);
  expect(await left(page)).toEqual(['profiles/u1', ...others].sort());
  // deleteAccountPermanently stops before deleting the sign-in account.
  const r = await page.evaluate(`(async () => {
    let deleted = false;
    loadFirebaseMods = async () => ({ auth: { currentUser: { uid: 'u1' } }, authMod: { deleteUser: async () => { deleted = true; } } });
    try { await deleteAccountPermanently(); return { threw: false, deleted }; } catch (e) { return { threw: true, deleted, msg: e.message }; }
  })()`) as { threw: boolean; deleted: boolean; msg?: string };
  expect(r).toMatchObject({ threw: true, deleted: false });
  // Trying again once it works finishes the job.
  await page.evaluate(`window.__failPrefix = ''`);
  expect(await page.evaluate(`deleteAccountCloudData('u1')`)).toBe(0);
  expect(await left(page)).toEqual(others);
});
