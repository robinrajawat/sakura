import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Standard editor expectations found missing in an audit (owner, 2026-11-10: "the basic
// expectations from an editor from a standard application point of view").
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function seed(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1400, height: 860 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    ensureDocumentForEditing();
    const n = (id, text, note) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: note || '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 'alpha beta gamma'), n(2, 'delta epsilon zeta', 'note one two three'), n(3, 'eta theta iota')]; rebuildParentIds(); nextId = 4;
    remarks = [{ id: 'c1', anchorNodeId: 3, person: 'Ana', text: 'thread words here', createdAt: 1 }];
    inlineExpandRemarksNodeIds = new Set([3]); inlineExpandNoteNodeIds = new Set([2]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
}
const rows = (page: Page) => page.evaluate('nodes.map(n => n.text)') as Promise<string[]>;
const note = (page: Page) => page.evaluate('nodes[1].note') as Promise<string>;
const editRow = (page: Page, id: number) => page.locator(`.node-row[data-id="${id}"] .node-label`).first().click();

test('Ctrl/Cmd+Z in a note or thread entry undoes the typing, not one letter', async ({ page }) => {
  await seed(page);
  await page.locator('#note-line-2').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#note-line-2')).not.toContainText('mo');
  await page.locator('#inline-remark-text-c1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' more');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#inline-remark-text-c1')).not.toContainText('mo');
});

test('Up and Down flow through an open note like one document', async ({ page }) => {
  await seed(page);
  // Row -> its note.
  await editRow(page, 2);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#note-line-2')).toBeFocused();
  // Note's last line -> next row.
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  expect((await rows(page))[2]).toContain('X');
  // Row below -> up into the note; note's first line -> its row.
  await editRow(page, 3);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#note-line-2')).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('Y');
  await page.keyboard.press('Escape');
  expect((await rows(page))[1]).toContain('Y');
  expect(await note(page)).toBe('note one two three');
});

test('emptying a note keeps it; Backspace in the empty note removes it', async ({ page }) => {
  await seed(page);
  await page.locator('#note-line-2').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('new');
  expect(await note(page)).toBe('new');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('X');
  await page.keyboard.press('Escape');
  expect(await note(page)).toBe('');
  expect((await rows(page))[1]).toBe('delta epsilon zetaX');
});

test('Ctrl+Home / Ctrl+End go to the start and end of the document', async ({ page }) => {
  await seed(page);
  await editRow(page, 2);
  await page.keyboard.press('Control+End');
  await page.keyboard.type('X');
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('Y');
  await page.keyboard.press('Escape');
  expect(await rows(page)).toEqual(['Yalpha beta gamma', 'delta epsilon zeta', 'eta theta iotaX']);
});

test('Link box: Enter puts the caret after the new link, Esc puts the words back selected', async ({ page }) => {
  await seed(page);
  const pickLastThree = async () => {
    await editRow(page, 1);
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('#sfmt-url')).toBeFocused();
  };
  await pickLastThree();
  await page.keyboard.press('Escape');
  expect(await page.evaluate('getSelection().toString()')).toBe('gam');
  await page.keyboard.press('Escape');
  await pickLastThree();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Z');
  await page.keyboard.press('Escape');
  expect((await rows(page))[0]).toBe('alpha beta gamZma');
  expect(JSON.stringify(await page.evaluate('nodes[0].marks'))).toContain('example.com');
});

test('Enter in a To-Do keeps the keys in To-Dos: typing next never edits the document', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 'a', text: 'first task', createdAt: Date.now(), done: false, subtasks: [] }])); } catch { /* storage unavailable */ } });
  await seed(page);
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
  await page.locator('.todo-text[data-id="a"]').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('zz');
  expect(await rows(page)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota']);
  expect(await page.evaluate('editingId')).toBeNull();
});

test('formatted text pasted into a note keeps bold but not its fonts and sizes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  await page.evaluate(async () => {
    const html = '<span style="color:red;font-family:Comic Sans MS;font-size:30px">red <b>bold</b></span>';
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob(['red bold'], { type: 'text/plain' }) })]);
  });
  await page.locator('#note-line-2').click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => note(page)).toContain('bold');
  const html = await note(page);
  expect(html).toMatch(/<b>bold<\/b>/);
  expect(html).not.toMatch(/Comic|30px|color/i);
});

test('Esc in a thread entry or the title leaves it, like in a row or a note', async ({ page }) => {
  await seed(page);
  await page.locator('#inline-remark-text-c1').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#inline-remark-text-c1')).not.toBeFocused();
  expect(await page.evaluate('selectedId')).toBe(3);
  await page.locator('#header-title').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#header-title')).not.toBeFocused();
});

test('Ctrl/Cmd+A pressed twice in a row selects every row', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate('[editingId, selectAllMode]')).toEqual([1, false]);
  await page.keyboard.press('ControlOrMeta+a');
  expect(await page.evaluate('[editingId, selectAllMode]')).toEqual([null, true]);
});

test('letters typed straight after Ctrl/Cmd+K or Ctrl/Cmd+F go to the box, not the row', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('theta');
  await expect(page.locator('#qa-input')).toHaveValue('theta');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('iota');
  await expect(page.locator('#search-input')).toHaveValue('iota');
  await page.keyboard.press('Escape');
  expect(await rows(page)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota']);
});

test('Ctrl/Cmd+X on selected rows cuts them; Ctrl/Cmd+Z brings them back', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('ControlOrMeta+x');
  expect(await rows(page)).toEqual(['eta theta iota']);
  await expect.poll(() => page.evaluate('navigator.clipboard.readText()')).toContain('alpha beta gamma');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await rows(page)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota']);
});

test('Alt+Up/Down move several selected rows together; Ctrl/Cmd+Z puts them back', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  expect(await rows(page)).toEqual(['eta theta iota', 'alpha beta gamma', 'delta epsilon zeta']);
  expect(await page.evaluate('multiSelectedIds')).toEqual([1, 2]);
  await page.keyboard.press('Alt+ArrowUp');
  expect(await rows(page)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota']);
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await rows(page)).toEqual(['alpha beta gamma', 'delta epsilon zeta', 'eta theta iota']);
});

test('a click on empty page space drops a several-row selection to one row', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate('multiSelectedIds.length')).toBe(2);
  await page.mouse.click(700, 820);
  expect(await page.evaluate('multiSelectedIds.length')).toBe(0);
});

test('Ctrl/Cmd+Z after a "/" list choice undoes it and keeps you typing in the row', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('End');
  await page.keyboard.type(' /head');
  await expect.poll(() => page.evaluate('!!_sbContextEl')).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('nodes[0].styles.heading')).toBe(1);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate('[nodes[0].styles.heading || 0, editingId]')).toEqual([0, 1]);
  await expect(page.locator('#in-1')).toBeFocused();
});

test('Shift+F10 or the Menu key opens the selected row\'s menu', async ({ page }) => {
  await seed(page);
  await editRow(page, 3);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+F10');
  await expect.poll(() => page.evaluate('!!_sbContextEl')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate('!!_sbContextEl')).toBe(false);
  await page.keyboard.press('ContextMenu');
  await expect.poll(() => page.evaluate('!!_sbContextEl')).toBe(true);
});

const nest = (page: Page) => page.evaluate(`nodes[1].depth = 1; nodes[2].depth = 2; rebuildParentIds(); collapsedIds = new Set(); render();`);

test('folding a branch while typing inside it moves the caret to the folded row', async ({ page }) => {
  await seed(page);
  await nest(page);
  await editRow(page, 3);
  await page.locator('.node-row[data-id="1"] .fold-dot, .node-row[data-id="1"] .fold-toggle').first().click();
  expect(await page.evaluate('[editingId, getEditableCaretOffset(getEditingInput())]')).toEqual([1, 16]);
  await expect(page.locator('#in-1')).toBeFocused();
});

test('Ctrl/Cmd+Up folds and Ctrl/Cmd+Down unfolds the row being typed in', async ({ page }) => {
  await seed(page);
  await nest(page);
  await editRow(page, 1);
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  expect(await page.evaluate('[[...collapsedIds], editingId]')).toEqual([[1], 1]);
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  expect(await page.evaluate('[[...collapsedIds], editingId]')).toEqual([[], 1]);
});

test('zoomed in, typing and arrows stay inside the branch; Ctrl/Cmd+. works while typing', async ({ page }) => {
  await seed(page);
  await nest(page);
  await editRow(page, 2);
  await page.keyboard.press('ControlOrMeta+.');
  expect(await page.evaluate('[focusedId, editingId]')).toEqual([2, 2]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate('selectedId')).toBe(2);
});

test('Ctrl/Cmd+F with words selected finds those words', async ({ page }) => {
  await seed(page);
  await editRow(page, 1);
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ControlOrMeta+ArrowRight');
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.locator('#search-input')).toHaveValue('alpha');
});
