import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner bug 2026-11-12: on a new computer the File Explorer listed a document before its content
// had arrived from the account. It opened blank, one typed row was saved, and that row was pushed
// over the whole document in the cloud. A document with no content here is now locked, never
// saved, and filled in when the content arrives.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  // The account's listing arrives (realtime docsIndex) before the document itself; it's opened.
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('sakura_docs_index_v1') || '[]');
    list.push({ id: 'd-remote', title: 'Plan', updatedAt: Date.now() });
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify(list));
    // @ts-expect-error -- bare global from index.html
    switchDoc('d-remote');
  });
});

test('a listed document whose content has not arrived is locked and never saved', async ({ page }) => {
  await expect(page.locator('#doc-content-pending-msg')).toBeVisible();
  await expect(page.locator('#editor-pane')).toHaveAttribute('inert', '');
  // Even if rows end up in memory somehow, the placeholder is not written.
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'typed on the placeholder' }]; dirty = true; saveToStorage();
  });
  expect(await page.evaluate(() => localStorage.getItem('sakura_doc_v1_d-remote'))).toBeNull();
});

test('the content shows in place when it arrives from the account', async ({ page }) => {
  await expect(page.locator('#doc-content-pending-msg')).toBeVisible();
  await page.evaluate(async () => {
    const cloud = { updatedAt: 1, title: 'Plan', nextId: 3, nodes: [{ id: 1, depth: 0, text: 'First real row' }, { id: 2, depth: 0, text: 'Second real row' }] };
    // updatedAt older than the listing: content is still taken, since none is stored here.
    // @ts-expect-error -- bare global from index.html
    await applyIncomingDocData(null, null, 'uid', 'd-remote', cloud, false);
  });
  await expect(page.locator('#doc-content-pending-msg')).toBeHidden();
  await expect(page.locator('#editor-pane')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#doc-content-pending')).toBeHidden();
  await expect(page.locator('#editor-pane')).toContainText('Second real row');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_doc_v1_d-remote') || 'null'));
  expect(stored.nodes).toHaveLength(2);
});

// Standard loading stages (owner 2026-11-21: "is it stuck, how long does it take"): the shape of a
// document while it loads, "taking longer" after a few seconds, Retry once it looks stuck, and
// offline said at once. The test pretends to be signed in (account active) so it reads as loading.
async function pendingFor(page, ms: number) {
  await page.evaluate((ms) => {
    localStorage.setItem('sakura_account_active', 'true');
    // @ts-expect-error -- bare globals from index.html
    const tab = findOpenTab('d-remote'); tab._pendingSince = Date.now() - ms; setDocContentPendingLock(true);
  }, ms);
}

test('loading shows the shape of a document, then says it is taking longer', async ({ page }) => {
  await pendingFor(page, 1000);
  await expect(page.locator('#doc-content-pending')).toHaveAttribute('data-stage', 'loading');
  await expect(page.locator('.doc-pending-skeleton')).toBeVisible();
  await expect(page.locator('#editor-wrap')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#doc-content-pending-retry')).toBeHidden();
  await pendingFor(page, 5000);
  await expect(page.locator('#doc-content-pending-detail')).toHaveText('This is taking longer than usual.');
});

test('the stage moves on by itself as time passes', async ({ page }) => {
  await pendingFor(page, 3900);
  await expect(page.locator('#doc-content-pending')).toHaveAttribute('data-stage', 'loading');
  await expect(page.locator('#doc-content-pending')).toHaveAttribute('data-stage', 'slow', { timeout: 3000 });
});

test('once it looks stuck there is a Retry that asks the account again', async ({ page }) => {
  await pendingFor(page, 13000);
  await expect(page.locator('#doc-content-pending')).toHaveAttribute('data-stage', 'stalled');
  await expect(page.locator('.doc-pending-skeleton')).toBeHidden();
  await expect(page.locator('#doc-content-pending-msg')).toHaveText('This document hasn’t arrived yet.');
  // Retry with a fake account that answers with the document: it shows in place.
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'uid' };
    // @ts-expect-error -- bare globals from index.html
    loadFirestoreMods = async () => ({ db: {}, mod: {
      doc: (...p: string[]) => p.join('/'),
      getDoc: async () => ({ exists: () => true, data: () => ({ updatedAt: 1, title: 'Plan', nextId: 2, nodes: [{ id: 1, depth: 0, text: 'Arrived on retry' }] }) }),
    } });
  });
  await page.locator('#doc-content-pending-retry').click();
  await expect(page.locator('#doc-content-pending')).toBeHidden();
  await expect(page.locator('#editor-pane')).toContainText('Arrived on retry');
});

test('a failed Retry says the account could not be reached', async ({ page }) => {
  await pendingFor(page, 13000);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'uid' };
    // @ts-expect-error -- bare globals from index.html
    loadFirestoreMods = async () => { throw new Error('network'); };
  });
  await page.locator('#doc-content-pending-retry').click();
  await expect(page.locator('#doc-content-pending-detail')).toHaveText('Couldn’t reach your account. Check your connection and try again.');
  await expect(page.locator('#doc-content-pending-retry')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sakura_doc_v1_d-remote'))).toBeNull();
});

test('offline says so at once', async ({ page, context }) => {
  await pendingFor(page, 1000);
  await context.setOffline(true);
  await expect(page.locator('#doc-content-pending')).toHaveAttribute('data-stage', 'offline');
  await expect(page.locator('#doc-content-pending-msg')).toHaveText('You’re offline.');
  await context.setOffline(false);
  await expect(page.locator('#doc-content-pending')).not.toHaveAttribute('data-stage', 'offline');
});
