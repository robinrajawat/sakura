import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-16: "we can not afford the data losses". A phone puts the app away (or closes it)
// without the field you're typing in losing focus, so a field that only saved when you left it lost
// the edit. Checked here by hiding the page mid-edit and reading what was stored.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = { id: 1, depth: 0, text: 'Row', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} };
    localStorage.setItem('sakura_doc_v1_s', JSON.stringify({ nodes: [n], nextId: 2, collapsed: [], title: 'Plan' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 's', title: 'Plan', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 's');
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 't1', text: 'Buy milk', done: false, createdAt: 1 }]));
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
});

const hide = (page: Page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
const openTodos = async (page: Page) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
};
const todoTexts = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]').map((t: { text: string }) => t.text));

test('a task\'s text being edited is saved when the app is put away', async ({ page }) => {
  await openTodos(page);
  await page.locator('#todo-text-t1').tap();
  await page.keyboard.press('End');
  await page.keyboard.type(' and eggs');
  await hide(page);
  expect(await todoTexts(page)).toEqual(['Buy milk and eggs']);
});

test('clearing a task\'s text and then putting the app away does not delete the task', async ({ page }) => {
  await openTodos(page);
  await page.locator('#todo-text-t1').tap();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await hide(page);
  expect(await todoTexts(page)).toEqual(['Buy milk']);
});

// The box's draft, in the shared draft store (synced to the account; see thread-drafts.spec.ts).
const todosDraft = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('sakura_thread_drafts_v1') || '{}')['field|todos-add'] || {}).html) as Promise<string | undefined>;

test('a task typed in "Add a task…" but not added comes back after the app is closed', async ({ page }) => {
  await openTodos(page);
  await page.locator('#todos-input').tap();
  await page.keyboard.type('Call the bank');
  await hide(page);
  // Stored before the app goes (so a failure below is about putting it back, not about saving it).
  expect(await todosDraft(page)).toBe('Call the bank');
  await page.reload();
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#todos-input')).toHaveValue('Call the bank');
  // Adding it clears the draft.
  await openTodos(page).catch(() => undefined);
  await page.locator('#todos-input').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => todoTexts(page)).toEqual(['Buy milk', 'Call the bank']);
  expect(await todosDraft(page)).toBeUndefined();
});

test('a document rename in progress is saved when the app is put away', async ({ page }) => {
  await page.locator('#phone-doc-menu-btn').tap();
  await page.locator('.sb-context-menu').getByText('Rename').tap();
  const box = page.locator('.inline-edit-input');
  await expect(box).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Quarter plan');
  await hide(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_docs_index_v1') || '[]')[0].title)).toBe('Quarter plan');
});
