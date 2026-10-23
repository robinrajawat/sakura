import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// One link experience everywhere (owner, 2026-10-23): a web address pasted with nothing selected
// goes in as a link (rows and To-Do titles now, as notes and threads already did), and the bar's
// Link box has just the address; selected words that are an address fill it in. A link's words are
// renamed by typing over them, and the link stays on the new words (owner: one-line link card).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const URL = 'https://example.com/guide';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function open(page: Page, todos: object[] = []) {
  await page.addInitScript((t) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
  }, todos.map((t) => ({ createdAt: Date.now(), done: false, subtasks: [], ...t })));
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
}
async function seedRow(page: Page, text: string, note = '') {
  await page.evaluate(([text, note]) => {
    (window as any).eval(`nodes = [normalizeNode({ id: 1, depth: 0, text: ${JSON.stringify(text)}, parentId: null, isCheckbox: false, checked: false, note: ${JSON.stringify(note)}, tags: [], styles: {} })];
      rebuildParentIds(); nextId = 2; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; undoStack = []; redoStack = [];
      inlineExpandNoteNodeIds = new Set(${note ? '[1]' : '[]'}); render();`);
  }, [text, note]);
}
const row = (page: Page) => page.evaluate(() => (window as any).eval('({ text: nodes[0].text, marks: rowMarksOf(nodes[0]) })'));
const bar = (page: Page) => page.locator('#selection-fmt-popover');
const copy = (page: Page, text: string) => page.evaluate((t) => navigator.clipboard.writeText(t), text);
// Selects the text of the first element matching `selector` (the bar shows on mouse release).
async function selectText(page: Page, selector: string, from = 0, count?: number) {
  await page.evaluate(([sel, from, count]) => {
    const el = document.querySelector(sel as string)!; const t = el.firstChild!;
    const r = document.createRange(); r.setStart(t, from as number); r.setEnd(t, count === null ? (t.textContent || '').length : (from as number) + (count as number));
    const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
  }, [selector, from, count ?? null] as const);
  await page.mouse.up();
  await page.evaluate(() => (window as any).updateSelectionFmtPopover());
}
async function selectChars(page: Page, from: number, count: number) {
  await page.keyboard.press('Home');
  for (let i = 0; i < from; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.mouse.up();
  await page.evaluate(() => (window as any).updateSelectionFmtPopover());
}

test('a web address pasted into a row goes in as a link; typing over its words renames it and keeps the link', async ({ page }) => {
  await open(page);
  await seedRow(page, 'See ');
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await copy(page, URL);
  await page.keyboard.press(`${mod}+v`);
  await page.keyboard.type('now');
  await expect.poll(() => row(page)).toEqual({ text: `See ${URL} now`, marks: [{ s: 4, e: 4 + URL.length, k: 'a', v: URL }] });

  await selectChars(page, 4, URL.length);
  await page.keyboard.type('the guide');
  await page.keyboard.press('Escape');
  await expect.poll(() => row(page)).toEqual({ text: 'See the guide now', marks: [{ s: 4, e: 13, k: 'a', v: URL }] });
  await expect(page.locator('.node-row[data-id="1"] a.row-weblink')).toHaveText('the guide');
  // One undo step per editing session, like any typing in a row (this one began before the paste).
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await row(page)).text).toBe('See ');
});

test('a plain selected URL that is not linked yet also fills Address', async ({ page }) => {
  await open(page);
  await seedRow(page, `Spec ${URL}`);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await selectChars(page, 5, URL.length);
  await bar(page).locator('[data-cmd="link"]').click();
  await expect(page.locator('#sfmt-url')).toHaveValue(URL);
  await page.keyboard.press('Enter');
  await expect.poll(() => row(page)).toEqual({ text: `Spec ${URL}`, marks: [{ s: 5, e: 5 + URL.length, k: 'a', v: URL }] });
});

test('To-Do titles: a pasted address goes in as a link, and typing over it renames it the same way', async ({ page }) => {
  await open(page, [{ id: 'a', text: 'Read' }]);
  await page.keyboard.press('Control+Shift+T');
  const title = page.locator('.todo-text[data-id="a"]');
  await title.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await copy(page, URL);
  await page.keyboard.press(`${mod}+v`);
  await expect(title.locator('a.row-weblink')).toHaveText(URL);
  await selectText(page, '.todo-text[data-id="a"] a.row-weblink');
  await page.keyboard.type('the docs');
  await page.keyboard.press('Enter');
  await expect(title.locator('a.row-weblink')).toHaveText('the docs');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(t.text).toBe('Read the docs');
  expect(t.marks).toEqual([{ s: 5, e: 13, k: 'a', v: URL }]);
});

test('notes use the same Link box: the address, in the bar', async ({ page }) => {
  await open(page);
  await seedRow(page, 'Row', `Spec ${URL}`);
  const note = page.locator('.node-note-line').first();
  await note.click();
  await page.keyboard.press('End');
  await page.evaluate((n) => {
    const el = document.querySelector('.node-note-line')!; const t = el.firstChild!;
    const r = document.createRange(); r.setStart(t, 5); r.setEnd(t, 5 + n);
    const s = getSelection()!; s.removeAllRanges(); s.addRange(r);
  }, URL.length);
  await page.mouse.up();
  await page.evaluate(() => (window as any).updateSelectionFmtPopover());
  await bar(page).locator('[data-cmd="link"]').click();
  await expect(page.locator('#sfmt-url')).toHaveValue(URL);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('nodes[0].note')).toMatch(/^Spec(&nbsp;| )<a href="https:\/\/example\.com\/guide" target="_blank" rel="noopener noreferrer">https:\/\/example\.com\/guide<\/a>$/);
});

test('right-click a web link in a row: the same Open / Copy / Edit / Remove items as in notes, above the row menu', async ({ page }) => {
  await open(page);
  await seedRow(page, 'Read the docs first');
  await page.evaluate((u) => (window as any).eval(`setRowMarksOn(nodes[0], [{ s: 9, e: 13, k: 'a', v: ${JSON.stringify(u)} }]); render();`), URL);
  const link = page.locator('.node-row[data-id="1"] a.row-weblink');
  const menu = page.locator('.sb-context-menu');
  await link.click({ button: 'right' });
  const labels = await menu.locator('.sb-context-item').allInnerTexts();
  expect(labels.slice(0, 4).map((l) => l.trim())).toEqual(['Open link', 'Copy link', 'Edit link…', 'Remove link']);
  await menu.getByText('Copy link').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(URL);

  await link.click({ button: 'right' });
  await menu.getByText('Edit link…').click();
  await expect(page.locator('#sfmt-url')).toBeFocused();
  await expect(page.locator('#sfmt-url')).toHaveValue(URL);
  await page.locator('#sfmt-url').fill('example.com/v2');
  await page.keyboard.press('Enter');
  await expect.poll(() => row(page)).toEqual({ text: 'Read the docs first', marks: [{ s: 9, e: 13, k: 'a', v: 'https://example.com/v2' }] });
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await row(page)).marks).toEqual([{ s: 9, e: 13, k: 'a', v: URL }]);

  await page.locator('.node-row[data-id="1"] a.row-weblink').click({ button: 'right' });
  await menu.getByText('Remove link').click();
  await expect.poll(() => row(page)).toEqual({ text: 'Read the docs first', marks: [] });
});

test('right-click a web link in a To-Do title: the same link items, then the task menu', async ({ page }) => {
  await open(page, [{ id: 'a', text: 'Read the docs', marks: [{ s: 9, e: 13, k: 'a', v: URL }], marksText: 'Read the docs' }]);
  await page.keyboard.press('Control+Shift+T');
  const link = page.locator('.todo-text[data-id="a"] a.row-weblink');
  await link.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  const labels = (await menu.locator('.sb-context-item').allInnerTexts()).map((l) => l.trim());
  expect(labels.slice(0, 4)).toEqual(['Open link', 'Copy link', 'Edit link…', 'Remove link']);
  expect(labels.length).toBeGreaterThan(4);
  await menu.getByText('Remove link').click();
  await expect(page.locator('.todo-text[data-id="a"] a.row-weblink')).toHaveCount(0);
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(t.marks || []).toEqual([]);
});

// Owner, 2026-10-23: editing a row's link "still not working optimally".
test('Edit link… opens the box at the words, with no Back button; an address with spaces is refused, not saved', async ({ page }) => {
  await open(page);
  await seedRow(page, 'Read the docs first');
  await page.evaluate((u) => (window as any).eval(`setRowMarksOn(nodes[0], [{ s: 9, e: 13, k: 'a', v: ${JSON.stringify(u)} }]); render();`), URL);
  const link = page.locator('.node-row[data-id="1"] a.row-weblink');
  const lb = (await link.boundingBox())!;
  await link.click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Edit link…').click();
  await expect(page.locator('#sfmt-url')).toBeFocused();
  await expect(bar(page).locator('.sfmt-back')).toHaveCount(0);
  // Starts at the words and stays over the editor (not spread over the file explorer).
  const pb = (await bar(page).boundingBox())!;
  const pane = (await page.locator('#editor-pane').boundingBox())!;
  expect(Math.abs(pb.x - (lb.x - 14))).toBeLessThan(2);
  expect(pb.x).toBeGreaterThanOrEqual(pane.x);
  await page.keyboard.type('the new guide');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sfmt-url')).toHaveClass(/is-invalid/);
  await expect(bar(page)).toBeVisible();
  expect((await row(page)).marks).toEqual([{ s: 9, e: 13, k: 'a', v: URL }]);
  await page.keyboard.type('example.com/new');
  await page.keyboard.press('Enter');
  await expect.poll(() => row(page)).toEqual({ text: 'Read the docs first', marks: [{ s: 9, e: 13, k: 'a', v: 'https://example.com/new' }] });
});
