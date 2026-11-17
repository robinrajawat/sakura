import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const probePath = path.resolve(__dirname, 'fixtures/storage-probe.html');

// Owner 2026-11-17: "Privacy matters". Signing out sends everything still on its way to the account,
// then removes the account's data from this device (as Gmail, Slack and Notion do), so the next
// person on a shared computer can't read it. If something can't reach the account, the person
// chooses: stay signed in, or sign out and keep it here. Nothing unsent is ever removed.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

// A reload must find this page's storage (see backup-simplified.spec.ts: under heavy load a file://
// page's storage occasionally never reaches the shared store).
async function gotoWithSharedStorage(page: Page) {
  for (let attempt = 1; ; attempt++) {
    await page.goto('file://' + indexPath);
    const marker = 'm' + Date.now() + '-' + attempt;
    await page.evaluate((m) => localStorage.setItem('sakura_e2e_storage_probe', m), marker);
    let shared = false;
    for (let i = 0; i < 20 && !shared; i++) {
      const probe = await page.context().newPage();
      try { await probe.goto('file://' + probePath); shared = (await probe.evaluate(() => localStorage.getItem('sakura_e2e_storage_probe'))) === marker; }
      finally { await probe.close(); }
      if (!shared) await page.waitForTimeout(150);
    }
    if (shared || attempt >= 5) {
      expect(shared, 'page localStorage never reached the shared store').toBe(true);
      await page.evaluate(() => localStorage.removeItem('sakura_e2e_storage_probe'));
      return;
    }
  }
}

async function signedInWithADocument(page: Page, everythingSent: boolean) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await gotoWithSharedStorage(page);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`(async () => {
    createDoc(); setDocTitleField('Salaries 2027');
    nodes = [{ id: 1, depth: 0, text: 'Confidential', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 2; render(); saveToStorage();
    fieldDraftSave('feedback', 'a private draft');
    await idbSet('diagblob:test', { xml: '<mxfile/>' });
    currentUser = { uid: 'u1' };
    window.__signedOut = false;
    loadFirebaseMods = async () => ({ auth: {}, authMod: { signOut: async () => { window.__signedOut = true; } } });
    sendEverythingBeforeSignOut = async () => ${everythingSent};
  })()`);
  return errors;
}
const stored = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sakura')).sort());

test('signing out with everything in the account removes the account\'s data from this device', async ({ page }) => {
  const errors = await signedInWithADocument(page, true);
  expect((await stored(page)).some((k) => k.startsWith('sakura_doc_v1_'))).toBe(true);
  await Promise.all([page.waitForNavigation(), page.evaluate('void signOutOfAccount()')]);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  const left = await stored(page);
  expect(left.filter((k) => /^sakura_(doc_v1_|docs_index|thread_drafts|current_doc|todos_v1|account_active)/.test(k))).toEqual([]);
  expect(left).toContain('sakura_welcome_seen');
  expect(await page.evaluate(`idbGet('diagblob:test')`)).toBeUndefined();
  await expect(page.getByText('Signed out. Your documents are in your account and were removed from this device.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('if something hasn\'t reached the account: "Stay signed in" changes nothing', async ({ page }) => {
  const errors = await signedInWithADocument(page, false);
  const before = await stored(page);
  await page.evaluate('void signOutOfAccount()');
  await expect(page.getByText('Some changes haven’t reached your account')).toBeVisible();
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  expect(await page.evaluate('window.__signedOut')).toBe(false);
  expect(await page.evaluate('!!currentUser')).toBe(true);
  expect(await stored(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('if something hasn\'t reached the account: signing out anyway keeps it on this device', async ({ page }) => {
  const errors = await signedInWithADocument(page, false);
  await page.evaluate('void signOutOfAccount()');
  await page.getByRole('button', { name: 'Sign out, keep them here' }).click();
  await expect.poll(() => page.evaluate('window.__signedOut')).toBe(true);
  expect((await stored(page)).some((k) => k.startsWith('sakura_doc_v1_'))).toBe(true);
  expect(await page.evaluate(`sessionStorage.getItem('sakura_clear_on_load')`)).toBeNull();
  await expect(page.getByText('Signed out. Your documents are still on this device.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('"everything is in the account" means: online, queue sent without error, no version waiting', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`createDoc(); currentUser = { uid: 'u1' }; pullAndMergeFromCloud = async () => {}; retryPendingVersionPushes = async () => {};`);
  const check = (setup: string) => page.evaluate(`(async () => {
    _syncLastStatus = 'synced'; _syncPushQueue.clear(); localStorage.removeItem('sakura_version_push_pending_v1');
    ${setup}
    return sendEverythingBeforeSignOut();
  })()`);
  expect(await check(`_syncPushQueue.set('doc:x', {}); flushSyncQueue = async () => { _syncPushQueue.clear(); };`)).toBe(true);
  expect(await check(`_syncPushQueue.set('doc:x', {}); flushSyncQueue = async () => { _syncLastStatus = 'error'; };`)).toBe(false);
  expect(await check(`localStorage.setItem('sakura_version_push_pending_v1', JSON.stringify({ d: [1] }));`)).toBe(false);
  await context.setOffline(true);
  expect(await check('')).toBe(false);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

// Owner 2026-11-17: "We should follow the standard practice": every open tab signs out together.
async function secondTab(page: Page) {
  const other = await page.context().newPage();
  await other.goto('file://' + indexPath);
  await expect.poll(() => other.evaluate('typeof render === "function" && !!currentDocId')).toBe(true);
  await other.evaluate(`currentUser = { uid: 'u1' }`);
  return other;
}

test('another open tab saves what it holds first, then clears and reloads with the sign-out', async ({ page }) => {
  const errors = await signedInWithADocument(page, true);
  const other = await secondTab(page);
  // An edit in the other tab that it hasn't saved yet.
  await other.evaluate(`nodes[0].text = 'Edited in the other tab';`);
  // The check runs after the other tabs were told to save: it sees that edit in storage.
  await page.evaluate(`sendEverythingBeforeSignOut = async () => { if ((localStorage.getItem('sakura_doc_v1_' + currentDocId) || '').includes('Edited in the other tab')) sessionStorage.setItem('sakura_saw_other_tab', '1'); return true; }`);
  await Promise.all([page.waitForNavigation(), other.waitForNavigation(), page.evaluate('void signOutOfAccount()')]);
  await expect.poll(() => other.evaluate('typeof render === "function"')).toBe(true);
  expect(await page.evaluate(`sessionStorage.getItem('sakura_saw_other_tab')`)).toBe('1');
  expect(await other.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sakura_doc_v1_')))).toEqual([]);
  expect(await other.evaluate('!!currentUser')).toBe(false);
  expect(errors).toEqual([]);
});

test('kept on this device: another open tab just shows signed out, and keeps its data', async ({ page }) => {
  const errors = await signedInWithADocument(page, false);
  const other = await secondTab(page);
  await page.evaluate('void signOutOfAccount()');
  await page.getByRole('button', { name: 'Sign out, keep them here' }).click();
  await expect.poll(() => other.evaluate('!!currentUser')).toBe(false);
  expect(await other.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('sakura_doc_v1_')))).toBe(true);
  expect(await other.evaluate(`sessionStorage.getItem('sakura_clear_on_load')`)).toBeNull();
  expect(errors).toEqual([]);
});

test('a second Sign out while the first is checking does nothing; the checking message goes with the check', async ({ page }) => {
  const errors = await signedInWithADocument(page, false);
  await page.evaluate(`window.__checks = 0; sendEverythingBeforeSignOut = async () => { window.__checks++; await new Promise((r) => setTimeout(r, 300)); return false; }`);
  await page.evaluate('void signOutOfAccount(); void signOutOfAccount();');
  await expect(page.getByText('Some changes haven’t reached your account')).toBeVisible();
  expect(await page.evaluate('window.__checks')).toBe(1);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.getByRole('button', { name: 'Stay signed in' }).click();
  expect(errors).toEqual([]);
});
