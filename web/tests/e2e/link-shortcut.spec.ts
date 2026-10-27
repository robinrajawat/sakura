import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Ctrl/Cmd+K links the selected words, as in Docs, Word and Notion (owner, 2026-10-27);
// Quick Assist moved to its own shortcut, Ctrl/Cmd+/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const URL = 'https://example.com/guide';

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
    (window as any).eval(`nodes = [normalizeNode({ id: 1, depth: 0, text: 'Read the guide', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })];
      rebuildParentIds(); nextId = 2; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; undoStack = []; redoStack = []; render();`);
  });
}
const row = (page: Page) => page.evaluate(() => (window as any).eval('({ text: nodes[0].text, marks: rowMarksOf(nodes[0]) })'));
const qaOpen = (page: Page) => page.evaluate(() => (window as any).isQaDropdownOpen());

test('Ctrl/Cmd+K on selected words in a row opens the Link box; Quick Assist stays shut', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press(`${mod}+k`);
  await expect(page.locator('#sfmt-url')).toBeFocused();
  expect(await qaOpen(page)).toBe(false);
  await page.keyboard.type(URL);
  await page.keyboard.press('Enter');
  await expect.poll(() => row(page)).toEqual({ text: 'Read the guide', marks: [{ s: 9, e: 14, k: 'a', v: URL }] });
});

test('Ctrl/Cmd+K with only a caret says to select words', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.press(`${mod}+k`);
  await expect(page.locator('#toast')).toContainText('Select words to link');
  await expect(page.locator('#sfmt-url')).toHaveCount(0);
  expect(await qaOpen(page)).toBe(false);
});

test('Ctrl/Cmd+/ opens Quick Assist, also while editing a row', async ({ page }) => {
  await open(page);
  await page.keyboard.press(`${mod}+/`);
  await expect(page.locator('#qa-input')).toBeFocused();
  await page.keyboard.press(`${mod}+/`);
  await expect.poll(() => qaOpen(page)).toBe(false);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press(`${mod}+/`);
  await expect.poll(() => qaOpen(page)).toBe(true);
});
