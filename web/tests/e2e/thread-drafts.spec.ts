import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Unsent thread replies are drafts, as in Slack or Gmail (docs/data-safety-audit.md): saved on the
// device as you type, back after a reload, synced to the account with both devices' text kept, and
// gone only once sent or closed.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DRAFTS_KEY = 'sakura_thread_drafts_v1';

async function open(page: Page, seed: boolean) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  if (seed) {
    await page.evaluate(`
      createDoc();
      const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
      nodes = [n(1, 0, 'Cutover'), n(2, 0, 'Rollback')]; rebuildParentIds(); nextId = 3;
      remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Ana', text: 'Weekend works for ops.', createdAt: 1 }];
      inlineExpandRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render(); saveToStorage();
    `);
  }
  return errors;
}
const drafts = (page: Page) => page.evaluate(`JSON.parse(localStorage.getItem('${DRAFTS_KEY}') || '{}')`) as Promise<Record<string, { html: string; kind?: string }>>;

test('A reply typed but not sent is back after a reload, as a question, in its open thread', async ({ page }) => {
  const errors = await open(page, true);
  await page.evaluate('openThreadComposer(1, true)');
  await expect(page.locator('.thread-composer-input')).toBeFocused();
  await page.keyboard.type('Who tells the customers?');
  const saved = await drafts(page);
  expect(Object.values(saved).map((d) => [d.html, d.kind])).toEqual([['Who tells the customers?', 'question']]);
  expect(Object.keys(saved)[0]).toBe(await page.evaluate('currentDocId') + '|1');

  // The app starts normally with a saved draft (drawing it during start-up once stopped the app).
  await page.reload();
  await expect.poll(() => page.evaluate('typeof render === "function" && !!currentDocId && nodes.length > 1'), { timeout: 15000 }).toBe(true);
  const box = page.locator('.thread-composer .thread-composer-input');
  await expect(box).toHaveText('Who tells the customers?');
  await expect(box).toHaveAttribute('data-placeholder', 'Ask a question…');

  // Sending it adds the entry and removes the draft.
  await box.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  expect(await page.evaluate('remarks.some(r => r.type === "question" && r.text === "Who tells the customers?")')).toBe(true);
  expect(await drafts(page)).toEqual({});
  expect(errors).toEqual([]);
});

test('A draft stays with its own document', async ({ page }) => {
  const errors = await open(page, true);
  await page.evaluate('openThreadComposer(2, false)');
  await expect(page.locator('.thread-composer-input')).toBeFocused();
  await page.keyboard.type('Check the backup first.');
  const docId = await page.evaluate('currentDocId');
  expect(Object.keys(await drafts(page))).toEqual([docId + '|2']);
  // Another document with the same row ids shows no draft.
  await page.evaluate('createDoc()');
  await expect.poll(() => page.evaluate(`currentDocId !== ${JSON.stringify(docId)}`)).toBe(true);
  expect(await page.evaluate('_threadDrafts.has(2)')).toBe(false);
  expect(Object.keys(await drafts(page))).toEqual([docId + '|2']);
  expect(errors).toEqual([]);
});

test('Closing an emptied reply box leaves no draft', async ({ page }) => {
  const errors = await open(page, true);
  await page.evaluate('openThreadComposer(2, false)');
  await expect(page.locator('.thread-composer-input')).toBeFocused();
  await page.keyboard.type('x');
  expect(Object.keys(await drafts(page))).toHaveLength(1);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.thread-composer')).toHaveCount(0);
  expect(await drafts(page)).toEqual({});
  expect(errors).toEqual([]);
});

test('Another device\'s draft arrives and shows; when both devices changed it, both texts are kept', async ({ page }) => {
  const errors = await open(page, true);
  const docId = await page.evaluate('currentDocId') as string;
  const key = docId + '|1';
  await page.evaluate('openThreadComposer(1, false)');
  await expect(page.locator('.thread-composer-input')).toBeFocused();
  await page.keyboard.type('From the laptop.');
  // The account's copy, last agreed on before both devices typed.
  await page.evaluate(`setMetaBase('threadDrafts', {})`);
  const applied = await page.evaluate(`(async () => {
    const ok = await applyIncomingMetaData('threadDrafts', { value: { ${JSON.stringify(key)}: { html: 'From the phone.', at: Date.now() + 5000 } }, updatedAt: Date.now() + 5000 });
    await refreshHubPanelAfterSync('threadDrafts');
    return ok;
  })()`);
  expect(applied).toBe(true);
  expect((await drafts(page))[key].html).toBe('From the phone.<br>From the laptop.');
  await expect(page.locator('.thread-composer .thread-composer-input')).toContainText('From the phone.');
  await expect(page.locator('.thread-composer .thread-composer-input')).toContainText('From the laptop.');
  expect(errors).toEqual([]);
});
