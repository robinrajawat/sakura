import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner (2026-10-28): the cursor must not jump somewhere unexpected while editing. Enter on a row whose
// children show continues into that list (as in Workflowy / Dynalist), Enter at the start of a row keeps
// the cursor on its words, whole-row formatting keeps the caret, and arrow keys on selected rows scroll
// only when the row would leave the view.

async function seed(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = []; let id = 1;
    for (let s = 0; s < 6; s++) { nodes.push(n(id++, 0, 'Section ' + s)); for (let c = 0; c < 6; c++) nodes.push(n(id++, 1, 'Child ' + s + '.' + c)); }
    rebuildParentIds(); nextId = id; remarks = []; collapsedIds = new Set(); editingId = null; undoStack = []; selectedId = null; render();
  `);
}
const edit = (page: Page, id: number, caret: number) => page.evaluate(`beginEditAt(${id}, ${caret})`);
const where = (page: Page) => page.evaluate(`(() => {
  const input = document.activeElement;
  const r = getSelection().getRangeAt(0); const pre = document.createRange(); pre.selectNodeContents(input); pre.setEnd(r.startContainer, r.startOffset);
  const i = getIndex(nodes, editingId);
  return { index: i, depth: nodes[i].depth, text: nodes[i].text, caret: pre.toString().length };
})()`) as Promise<{ index: number; depth: number; text: string; caret: number }>;

test('Enter at the end of a row whose children show adds its first child, right under it', async ({ page }) => {
  await seed(page);
  await edit(page, 1, -1);
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 1, depth: 1, text: '', caret: 0 });
  // Folded, it is still a sibling after the folded row.
  await page.keyboard.press('Escape');
  await page.evaluate('nodes.splice(1, 1); collapsedIds = new Set([1]); render(); beginEditAt(1, -1)');
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 7, depth: 0, text: '', caret: 0 });
});

test('Enter mid-text on an open parent moves the rest into its first child', async ({ page }) => {
  await seed(page);
  await edit(page, 1, 4);
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 1, depth: 1, text: 'ion 0', caret: 0 });
  expect(await page.evaluate('nodes[0].text')).toBe('Sect');
});

test('Enter at the start of a row opens a blank row above, with the cursor on it (as in Dynalist)', async ({ page }) => {
  await seed(page);
  await edit(page, 4, 0);
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 3, depth: 1, text: '', caret: 0 });
  expect(await page.evaluate('nodes[4].text')).toBe('Child 0.2');
});

test('Enter with words selected replaces them, then splits there', async ({ page }) => {
  await seed(page);
  await edit(page, 4, 2);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 4, depth: 1, text: 'ild 0.2'.slice(2), caret: 0 });
  expect(await page.evaluate('nodes[3].text')).toBe('Ch');
});

test('a checklist continues on Enter; Enter on an empty to-do ends it', async ({ page }) => {
  await seed(page);
  await page.evaluate('nodes[3].isCheckbox = true; render()');
  await edit(page, 4, -1);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('[getIndex(nodes, editingId), nodes[getIndex(nodes, editingId)].isCheckbox]')).toEqual([4, true]);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('[getIndex(nodes, editingId), nodes[getIndex(nodes, editingId)].isCheckbox]')).toEqual([4, false]);
});

test('Delete at the end of an empty row removes it, even before a row with children', async ({ page }) => {
  await seed(page);
  await page.evaluate('nodes.splice(7, 0, { id: 99, depth: 0, text: "", parentId: null, isCheckbox: false, checked: false, note: "", tables: [], images: [], tags: [], styles: {} }); rebuildParentIds(); render()');
  await edit(page, 99, 0);
  await page.keyboard.press('Delete');
  await expect.poll(() => where(page)).toEqual({ index: 7, depth: 0, text: 'Section 1', caret: 0 });
});

test('Undo and Redo from a row keep you editing, with the cursor where it was', async ({ page }) => {
  await seed(page);
  await edit(page, 4, 4);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+z');
  await expect.poll(() => where(page)).toEqual({ index: 3, depth: 1, text: 'Child 0.2', caret: 4 });
  await page.keyboard.press('Control+y');
  await expect.poll(() => page.evaluate('nodes[3].text')).toBe('Chil');
  expect(await page.evaluate('editingId !== null')).toBe(true);
});

test('typing right after Shift+Enter goes into the note', async ({ page }) => {
  await seed(page);
  await edit(page, 4, -1);
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('fast');
  await expect.poll(() => page.evaluate('[nodes[3].text, document.activeElement.textContent]')).toEqual(['Child 0.2', 'fast']);
});

test('whole-row formatting and headings keep the caret where it was', async ({ page }) => {
  await seed(page);
  for (const key of ['Control+b', 'Control+i', 'Control+u', 'Control+Alt+1']) {
    await edit(page, 4, 3);
    await page.keyboard.press(key);
    await expect.poll(() => where(page).then((w) => w.caret)).toBe(3);
  }
});

test('arrow keys on selected rows do not scroll while the row is in view', async ({ page }) => {
  await seed(page);
  await page.evaluate('selectedId = 3; render()');
  const scrollTops = () => page.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.scrollTop).reduce((a, b) => a + b, 0) + window.scrollY);
  const before = await scrollTops();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  expect(await page.evaluate('selectedId')).toBe(6);
  expect(await scrollTops()).toBe(before);
});

test('typing on a selected row adds to the end of its words, never replaces them', async ({ page }) => {
  await seed(page);
  await page.evaluate('editingId = null; selectedId = 3; render()');
  await page.keyboard.type('!x');
  await expect.poll(() => where(page)).toEqual({ index: 2, depth: 1, text: 'Child 0.1!x', caret: 11 });
});

test('Enter mid-text in a heading keeps both halves headings; Enter at its end starts a plain row', async ({ page }) => {
  await seed(page);
  await page.evaluate('nodes[3].styles = { ...nodes[3].styles, heading: 2 }; render()');
  await edit(page, 4, 5);
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 4, depth: 1, text: ' 0.2', caret: 0 });
  expect(await page.evaluate('[nodes[3].styles.heading, nodes[4].styles.heading]')).toEqual([2, 2]);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect.poll(() => where(page)).toEqual({ index: 5, depth: 1, text: '', caret: 0 });
  expect(await page.evaluate('nodes[5].styles.heading || 0')).toBe(0);
});

test('Backspace at the start of a to-do row removes its checkbox first, then merges', async ({ page }) => {
  await seed(page);
  await page.evaluate('nodes[3].isCheckbox = true; render()');
  await edit(page, 4, 0);
  await page.keyboard.press('Backspace');
  await expect.poll(() => where(page)).toEqual({ index: 3, depth: 1, text: 'Child 0.2', caret: 0 });
  expect(await page.evaluate('nodes[3].isCheckbox')).toBe(false);
  expect(await page.locator('[data-id="4"] input[type=checkbox], [data-id="4"] .node-checkbox').count()).toBe(0);
  await page.keyboard.press('Backspace');
  await expect.poll(() => where(page)).toEqual({ index: 2, depth: 1, text: 'Child 0.1Child 0.2', caret: 9 });
  // One undo brings the checkbox back.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(await page.evaluate('nodes[3].isCheckbox')).toBe(true);
});

const pasteText = (page: Page, text: string) => page.evaluate((t) => {
  const dt = new DataTransfer(); dt.setData('text/plain', t);
  document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, text);
const texts = (page: Page) => page.evaluate('nodes.map(n => "  ".repeat(n.depth) + n.text)') as Promise<string[]>;
const seedFlat = (page: Page) => page.evaluate(`
  const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
  nodes = [n(1, 0, 'Alpha'), n(2, 0, 'Delta'), n(3, 0, 'Foxtrot')]; rebuildParentIds(); nextId = 4; collapsedIds = new Set(); editingId = null; undoStack = []; selectedId = null; render();
`);

test('pasting several lines mid-row puts them in as rows between the two halves', async ({ page }) => {
  await seed(page); await seedFlat(page);
  await edit(page, 2, 2);
  await pasteText(page, 'one\ntwo\nthree');
  expect(await texts(page)).toEqual(['Alpha', 'De', 'one', 'two', 'three', 'lta', 'Foxtrot']);
  await expect.poll(() => where(page)).toEqual({ index: 4, depth: 0, text: 'three', caret: 5 });
  // One undo puts the row back as it was.
  await page.keyboard.press('Control+z');
  expect(await texts(page)).toEqual(['Alpha', 'Delta', 'Foxtrot']);
});

test('pasting several lines at the start of a row puts them above it, the row stays whole', async ({ page }) => {
  await seed(page); await seedFlat(page);
  await edit(page, 2, 0);
  await pasteText(page, 'one\ntwo');
  expect(await texts(page)).toEqual(['Alpha', 'one', 'two', 'Delta', 'Foxtrot']);
  await expect.poll(() => where(page)).toEqual({ index: 2, depth: 0, text: 'two', caret: 3 });
});

test('pasting lines into a row whose children show puts them in its list', async ({ page }) => {
  await seed(page);
  await edit(page, 1, 4);
  await pasteText(page, 'one\ntwo');
  expect((await texts(page)).slice(0, 5)).toEqual(['Sect', '  one', '  two', '  ion 0', '  Child 0.0']);
});

test('one line copied with its line break pastes as just the words', async ({ page }) => {
  await seed(page); await seedFlat(page);
  await edit(page, 2, 2);
  await pasteText(page, 'one\n');
  // The synthetic event can't run the browser's own paste; the handler inserts it itself.
  await expect.poll(() => texts(page)).toEqual(['Alpha', 'Deonelta', 'Foxtrot']);
});

test('with several rows selected: Backspace deletes them, typing does nothing, Escape keeps just one', async ({ page }) => {
  await seed(page); await seedFlat(page);
  await page.evaluate('setSingleSelection(1); render()');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await page.evaluate('multiSelectedIds.length')).toBe(2);
  await page.keyboard.type('x');
  expect(await texts(page)).toEqual(['Alpha', 'Delta', 'Foxtrot']);
  expect(await page.evaluate('editingId')).toBe(null);
  await page.keyboard.press('Escape');
  expect(await page.evaluate('multiSelectedIds.length <= 1')).toBe(true);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Backspace');
  await expect.poll(() => texts(page)).not.toContain('Delta');
});

test('pasting several lines into an empty row fills it, then adds the rest after it', async ({ page }) => {
  await seed(page); await seedFlat(page);
  await page.evaluate('nodes[1].text = ""; render()');
  await edit(page, 2, 0);
  await pasteText(page, 'one\ntwo');
  expect(await texts(page)).toEqual(['Alpha', 'one', 'two', 'Foxtrot']);
  await expect.poll(() => where(page)).toEqual({ index: 2, depth: 0, text: 'two', caret: 3 });
});
