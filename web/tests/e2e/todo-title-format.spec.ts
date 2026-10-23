import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// To-Do titles get the same selection bar as rows (owner, 2026-10-23: "keep the same floating bar
// everywhere"). The title stays plain text in t.text; formatting is t.marks/t.marksText, the same
// shape as a row's (src/utils/rowMarks.ts), kept by normalizeTodo and drawn by the Hub too.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const hubPath = path.resolve(__dirname, '../../hub.html');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openWith(page: Page, todos: object[]) {
  const full = todos.map((t) => ({ createdAt: Date.now(), done: false, subtasks: [], ...t }));
  await page.addInitScript((t) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
  }, full);
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => { const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none'; });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
const title = (page: Page, id: string) => page.locator(`.todo-text[data-id="${id}"]`);
// Clicks into the title and selects `word` with Shift+arrows.
async function selectWord(page: Page, id: string, text: string, word: string) {
  await title(page, id).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < text.indexOf(word); i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.mouse.up();
  await page.evaluate(() => (window as any).updateSelectionFmtPopover());
}
const bar = (page: Page) => page.locator('#selection-fmt-popover');

test('selecting words in a title shows the same bar; Bold formats just those words and saves', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Call the vendor today' }]);
  await selectWord(page, 'a', 'Call the vendor today', 'vendor');
  await expect(bar(page)).toHaveClass(/open/);
  await expect(bar(page)).toHaveAttribute('data-mode', 'row');
  await bar(page).locator('[data-cmd="bold"]').click();
  await expect(title(page, 'a').locator('b')).toHaveText('vendor');
  await expect(bar(page).locator('[data-cmd="bold"]')).toHaveClass(/active/);
  const t = (await stored(page))[0];
  expect(t.text).toBe('Call the vendor today');
  expect(t.marks).toEqual([{ s: 9, e: 15, k: 'b' }]);
  // Undo in the title takes it off.
  await page.keyboard.press(`${mod}+z`);
  await expect(title(page, 'a').locator('b')).toHaveCount(0);
});

test('highlight from the palette, Clear formatting, and a web link from the address box', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Read the docs first' }]);
  await selectWord(page, 'a', 'Read the docs first', 'docs');
  await bar(page).locator('[data-cmd="colors"]').click();
  await bar(page).locator('[data-kind="hl"][data-sw="green"]').click();
  await expect(title(page, 'a').locator('mark.hl-mark-green')).toHaveText('docs');
  await selectWord(page, 'a', 'Read the docs first', 'docs');
  await bar(page).locator('[data-cmd="clear"]').click();
  await expect(title(page, 'a').locator('mark')).toHaveCount(0);
  await selectWord(page, 'a', 'Read the docs first', 'docs');
  await bar(page).locator('[data-cmd="link"]').click();
  await page.locator('#sfmt-url').fill('example.com/guide');
  await page.keyboard.press('Enter');
  await expect(title(page, 'a').locator('a.row-weblink')).toHaveText('docs');
  expect((await stored(page))[0].marks).toEqual([{ s: 9, e: 13, k: 'a', v: 'https://example.com/guide' }]);
});

test('typing and chips keep the formatting on its words', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Ask @Ana about rollout', marks: [{ s: 15, e: 22, k: 'b' }], marksText: 'Ask @Ana about rollout' }]);
  await expect(title(page, 'a').locator('b')).toHaveText('rollout');
  await expect(title(page, 'a').locator('.todo-at')).toHaveText('@Ana');
  await title(page, 'a').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Please ');
  await page.keyboard.press('Enter');
  const t = (await stored(page))[0];
  expect(t.text).toBe('Please Ask @Ana about rollout');
  expect(t.marks).toEqual([{ s: 22, e: 29, k: 'b' }]);
});

test('the Hub keeps and shows a title\'s formatting', async ({ page }) => {
  const todos = [{ id: 'h', text: 'Ship the build', marks: [{ s: 9, e: 14, k: 'b' }, { s: 0, e: 4, k: 'hl', v: 'yellow' }], marksText: 'Ship the build', createdAt: Date.now(), completedAt: null, done: false, dueDate: null, link: null, linkLabel: null, nodeRef: null, repeat: null, subtasks: [] }];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((t) => localStorage.setItem('sakura_todos_v1', JSON.stringify(t)), todos);
  await page.goto('file://' + hubPath);
  await page.evaluate(() => {
    const w = window as any;
    document.getElementById('auth-gate')!.style.display = 'none';
    document.getElementById('hub-app')!.style.display = 'block';
    w.eval("currentUser = { displayName: 'Test User' }; loadTodosLocal(); renderTodos(); saveTodos();");
  });
  const row = page.locator('.swipe-row[data-id="h"] .todo-row-text');
  await expect(row.locator('b')).toHaveText('build');
  await expect(row.locator('mark.hl-mark-yellow')).toHaveText('Ship');
  expect((await stored(page))[0].marks).toEqual([{ s: 0, e: 4, k: 'hl', v: 'yellow' }, { s: 9, e: 14, k: 'b' }]);
});
