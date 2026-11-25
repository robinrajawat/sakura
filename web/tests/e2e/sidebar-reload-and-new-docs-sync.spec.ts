// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');

// Owner 2026-11-25: on every reload an "Untitled" row sat at the top of the File Explorer until
// loading finished. The list was drawn before the last document was opened and not again after.
test('a reload shows the documents, with no Untitled row', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true');
    if (!localStorage.getItem('sakura_docs_index_v1')) {
      const idx = [];
      for (const [id, t, at] of [['da1', 'Alpha doc', 1000], ['db2', 'Beta doc', 2000]]) {
        localStorage.setItem('sakura_doc_v1_' + id, JSON.stringify({ title: t, nodes: [{ id: 1, text: 'x', depth: 0 }], nextId: 2 }));
        idx.push({ id, title: t, updatedAt: at });
      }
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify(idx));
    }
    // Every version of the list drawn during startup.
    window.__drawn = [];
    new MutationObserver(() => { const s = document.getElementById('sb-docs-list'); if (s) window.__drawn.push(s.innerText); }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof renderSidebar === "function"');
  await page.reload();
  await page.waitForFunction('typeof renderSidebar === "function" && currentDocId');
  await expect(page.locator('#sb-docs-list .sdoc-item').first()).toBeVisible();
  expect(await page.locator('#sb-docs-list .sdoc-unsaved').count()).toBe(0);
  expect((await page.evaluate(() => window.__drawn)).some((t) => /Untitled/.test(t))).toBe(false);
});

test('with every document closed, the unsaved Untitled row still shows', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof renderSidebar === "function"');
  await page.evaluate(() => { document.getElementById('welcome-overlay')?.classList.remove('open'); clearToNoDocumentState(); renderSidebar(); });
  await expect(page.locator('#sb-docs-list .sdoc-unsaved')).toHaveText('Untitled');
});

// A document made on this device without typing in it goes to the account at once, or another
// device drops it from the list (owner 2026-11-25: an added inbox draft vanished; Duplicate too).
test('a duplicate is sent to the account without an edit', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof renderSidebar === "function"');
  const r = await page.evaluate(async () => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    currentUser = { uid: 'me' }; flushSyncQueue = async () => {};
    ensureDocumentForEditing(); const src = currentDocId;
    await duplicateDoc(src);
    return { dup: currentDocId !== src, queued: _syncPushQueue.has('doc:' + currentDocId) };
  });
  expect(r).toEqual({ dup: true, queued: true });
});
