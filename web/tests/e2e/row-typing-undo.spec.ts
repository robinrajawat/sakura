import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Undo while typing in a row goes back a word at a time, as in Docs and Word (owner, 2026-10-27).
// Back where the edit began it moves on to the app's own steps; leaving the row keeps the whole
// edit as one step.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
  await page.evaluate(() => {
    (window as any).eval(`nodes = [normalizeNode({ id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }),
      normalizeNode({ id: 2, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })];
      rebuildParentIds(); nextId = 3; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; undoStack = []; redoStack = []; render();`);
  });
}
const texts = (page: Page) => page.evaluate(() => (window as any).eval('nodes.map(n => n.text)'));
const live = (page: Page) => page.locator('#in-2');

test('Ctrl/Cmd+Z while typing goes back a word at a time, then redo brings words back', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' the next release');
  await page.keyboard.press(`${mod}+z`);
  await expect(live(page)).toHaveText('Plan the next ');
  await page.keyboard.press(`${mod}+z`);
  await expect(live(page)).toHaveText('Plan the ');
  await page.keyboard.press(`${mod}+y`);
  await expect(live(page)).toHaveText('Plan the next ');
  // Still editing, caret where the words came back: typing carries on there.
  await page.keyboard.type('big');
  await expect(live(page)).toHaveText('Plan the next big');
});

test('a run of deletes is one step', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ahead');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await expect(live(page)).toHaveText('Plan a');
  await page.keyboard.press(`${mod}+z`);
  await expect(live(page)).toHaveText('Plan ahead');
});

test('back where the edit began, undo moves on to earlier changes; leaving the row keeps one step', async ({ page }) => {
  await open(page);
  // An earlier change: edit row 1 and leave it.
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' draft');
  await page.keyboard.press('Escape');
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' one two');
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+z`);
  await expect(live(page)).toHaveText('Plan');
  expect(await texts(page)).toEqual(['First draft', 'Plan']);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => texts(page)).toEqual(['First', 'Plan']);

  // A whole edit, once left, undoes in one step.
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' three four');
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => texts(page)).toEqual(['First', 'Plan']);
});
