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
  await expect(page.locator('#editor-wrap')).toHaveAttribute('inert', '');
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
  await expect(page.locator('#editor-wrap')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#editor-pane')).toContainText('Second real row');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_doc_v1_d-remote') || 'null'));
  expect(stored.nodes).toHaveLength(2);
});
