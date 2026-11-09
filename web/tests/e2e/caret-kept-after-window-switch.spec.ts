import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner bug (2026-11-09): typing in a note, switching to another window and back put the caret at
// the start of the note. Standard editor behaviour everywhere: leaving the window is not leaving
// the field, so the caret (and the edit) stay exactly where they were.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function seed(page: Page, todos: object[] = []) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true');
      localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
    } catch { /* storage unavailable */ }
  }, todos.map((t) => ({ createdAt: Date.now(), done: false, subtasks: [], ...t })));
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    ensureDocumentForEditing();
    const n = (id, text, note) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: note || '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 'hello world'), n(2, 'second', 'note words here')]; rebuildParentIds(); nextId = 3;
    remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Ana', text: 'thread words here', createdAt: 1 }];
    inlineExpandRemarksNodeIds = new Set([1]); inlineExpandNoteNodeIds = new Set([2]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
}

// A real window switch: another window comes to the front, then Sakura again.
async function awayAndBack(page: Page, context: BrowserContext) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  const other = await context.newPage();
  await other.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
  await other.close();
}

async function caretTwoBeforeEnd(page: Page) {
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
}

test('row text: still editing, caret where it was', async ({ page, context }) => {
  await seed(page);
  await page.locator('.node-row[data-id="1"] .node-label').first().click();
  await caretTwoBeforeEnd(page);
  await awayAndBack(page, context);
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  expect(await page.evaluate('nodes[0].text')).toBe('hello worXld');
});

test('note: caret where it was, not at the start', async ({ page, context }) => {
  await seed(page);
  await page.locator('#note-line-2').click();
  await caretTwoBeforeEnd(page);
  await awayAndBack(page, context);
  await page.keyboard.type('X');
  expect(await page.evaluate('nodes[1].note')).toBe('note words heXre');
});

test('thread entry: caret where it was', async ({ page, context }) => {
  await seed(page);
  await page.locator('#inline-remark-text-c1').click();
  await caretTwoBeforeEnd(page);
  await awayAndBack(page, context);
  await page.keyboard.type('X');
  await page.locator('.node-row[data-id="2"] .node-label').first().click();
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').text")).toBe('thread words heXre');
});

test('a selection survives too', async ({ page, context }) => {
  await seed(page);
  await page.locator('#note-line-2').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await awayAndBack(page, context);
  await page.keyboard.type('X');
  expect(await page.evaluate('nodes[1].note')).toBe('note words X');
});

test('To-Do text: caret where it was', async ({ page, context }) => {
  await seed(page, [{ id: 'a', text: 'call the vendor' }]);
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
  await page.locator('.todo-text[data-id="a"]').click();
  await caretTwoBeforeEnd(page);
  await awayAndBack(page, context);
  await page.keyboard.type('X');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]?.text)).toBe('call the vendXor');
});

test('a click elsewhere after coming back still finishes the edit normally', async ({ page, context }) => {
  await seed(page);
  await page.locator('.node-row[data-id="1"] .node-label').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await awayAndBack(page, context);
  await page.locator('#note-line-2').click();
  expect(await page.evaluate('({ editing: editingId, text: nodes[0].text })')).toEqual({ editing: null, text: 'hello world!' });
});
