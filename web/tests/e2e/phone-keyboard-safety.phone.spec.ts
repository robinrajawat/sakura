import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Phones must never lose or mangle a document (owner, 2026-11-13: "make sure that the mobile will
// not corrupt the documents"). Two phone-only risks: the app is put away mid-typing without the
// row being left, and keyboards that send Enter/Backspace as an input with no key event (Android's
// key 229), which used to put a raw line break inside the row.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_k', JSON.stringify({ nodes: [n(1, 'First'), n(2, 'Second')], nextId: 3, collapsed: [], title: 'Keys' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'k', title: 'Keys', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'k');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Second');
});

const live = (page: Page) => page.evaluate(() => (0, eval)('nodes.map(n => n.text)') as string[]);
const stored = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('sakura_doc_v1_k') || '{}').nodes || []).map((n: { text: string }) => n.text) as string[]);
const editRow = async (page: Page, text: string) => {
  await page.locator('.node-row', { hasText: text }).first().locator('.node-label').tap();
  await expect.poll(() => page.evaluate(() => (0, eval)('editingId') !== null)).toBe(true);
};
// What a key-229 keyboard sends: only a beforeinput, which the browser acts on unless refused.
const imeInput = (page: Page, inputType: string) => page.evaluate((inputType) => {
  const inp = (0, eval)('getEditingInput()') as HTMLElement;
  const ev = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
  if (inp.dispatchEvent(ev)) document.execCommand(inputType === 'insertParagraph' ? 'insertParagraph' : 'delete');
}, inputType);

test('putting the app away mid-typing keeps what was typed', async ({ page }) => {
  await editRow(page, 'First');
  await page.keyboard.press('End');
  await page.keyboard.type(' and more');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await stored(page)).toEqual(['First and more', 'Second']);
});

test('Enter from a keyboard with no key event makes a new row, not a line break inside the row', async ({ page }) => {
  await editRow(page, 'Second');
  await page.keyboard.press('End');
  await imeInput(page, 'insertParagraph');
  await expect.poll(() => live(page)).toEqual(['First', 'Second', '']);
  await page.keyboard.type('Third');
  await page.locator('#phone-edit-bar [data-act="done"]').tap();
  await expect.poll(() => live(page)).toEqual(['First', 'Second', 'Third']);
  expect(await page.locator('#editor-pane .node-label div, #editor-pane .node-label br').count()).toBe(0);
});

test('Backspace at the start of a row from such a keyboard joins it to the row above', async ({ page }) => {
  await editRow(page, 'Second');
  await page.keyboard.press('Home');
  await imeInput(page, 'deleteContentBackward');
  await expect.poll(() => live(page)).toEqual(['FirstSecond']);
});

test('Backspace inside a row still just deletes a letter', async ({ page }) => {
  await editRow(page, 'Second');
  await page.keyboard.press('End');
  await imeInput(page, 'deleteContentBackward');
  await page.locator('#phone-edit-bar [data-act="done"]').tap();
  await expect.poll(() => live(page)).toEqual(['First', 'Secon']);
});
