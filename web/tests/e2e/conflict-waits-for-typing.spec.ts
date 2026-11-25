// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Rows save as you type (#956), so a push can meet another device's copy mid-sentence. Settling that
// ends the edit and redraws the page, which closed the iPhone keyboard (owner 2026-11-25): it now
// waits until you stop typing, then the document is pushed (and settled) again.
test('a push conflict while typing waits until you stop, then syncs again', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    ensureDocumentForEditing();
    nodes = [normalizeNode({ id: 1, text: 'typing here', depth: 0 })];
    markDirty(); saveToStorage(); render(); beginEditAt(1, -1);
    window.__queued = [];
    const orig = queueSync; queueSync = (kind, id) => { window.__queued.push(kind + ':' + id); };
    window.__restore = () => { queueSync = orig; };
  });
  await expect(page.locator('#in-1')).toBeFocused();
  const docId = await page.evaluate(async () => {
    await resolveDocPushConflict({}, {}, 'u1', currentDocId, { title: 'Theirs', nodes: [{ id: 1, text: 'their text', depth: 0 }], rev: 5 });
    return currentDocId;
  });
  // Nothing changed under the caret: still editing the same row, still focused, text untouched.
  await expect(page.locator('#in-1')).toBeFocused();
  expect(await page.evaluate(() => [editingId, nodes[0].text])).toEqual([1, 'typing here']);
  await page.keyboard.type(' more');
  await page.waitForTimeout(1500);
  // Still typing: the clash keeps waiting, and a push attempt sends nothing.
  expect(await page.evaluate((id) => _docConflictWaitsForTyping.has(id), docId)).toBe(true);
  const sent = await page.evaluate(async (id) => {
    let calls = 0;
    const spy = new Proxy({}, { get: () => (...a) => { calls++; return {}; } });
    await pushDocToCloud(spy, {}, id);
    return calls;
  }, docId);
  expect(sent).toBe(0);
  // Leaving the row: within a moment the document goes to the account again.
  await page.evaluate(() => { window.__queued = []; commitEdit(); render(); });
  await expect.poll(() => page.evaluate((id) => !_docConflictWaitsForTyping.has(id) && window.__queued.includes('doc:' + id), docId), { timeout: 4000 }).toBe(true);
  await page.evaluate(() => window.__restore());
});
