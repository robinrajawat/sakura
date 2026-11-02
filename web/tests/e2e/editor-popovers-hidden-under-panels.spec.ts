import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Bug (owner 2026-11-02): the "N rows selected" pill and the formatting bar stayed on screen over
// Settings, which covers the editor. They belong to the editor, so they go away while Settings is open,
// and keys pressed in Settings never act on the rows behind it.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => {
    const w = window as any;
    const n = (id: number, t: string) => ({ id, depth: 0, text: t, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    w.eval('ensureDocumentForEditing();');
    w.eval(`nodes = [${JSON.stringify(n(1, 'Alpha words'))}, ${JSON.stringify(n(2, 'Beta'))}, ${JSON.stringify(n(3, 'Gamma'))}]; rebuildParentIds(); nextId = 4; render();`);
  });
});

const row = (page: Page, id: number) => page.locator(`.node-row[data-id="${id}"]`);

test('selected-rows pill and its formatting bar hide under Settings, and Delete there leaves the rows alone', async ({ page }) => {
  await row(page, 1).locator('.node-dot').click();
  await row(page, 2).locator('.node-dot').click({ modifiers: ['Shift'] });
  await expect(page.locator('#row-sel-pill')).toContainText('2 rows selected');
  // Whole rows selected also shows the formatting bar (for all their words).
  await expect(page.locator('#selection-fmt-popover')).toBeVisible();
  await page.click('#rail-settings-btn');
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect(page.locator('#row-sel-pill')).toBeHidden();
  await expect(page.locator('#selection-fmt-popover')).toBeHidden();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await page.evaluate('nodes.length')).toBe(3);
});

test('formatting bar for chosen words hides under Settings', async ({ page }) => {
  await row(page, 1).locator('.node-label').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await expect(page.locator('#selection-fmt-popover')).toBeVisible();
  await page.click('#rail-settings-btn');
  await expect(page.locator('#settings-panel')).toBeVisible();
  await expect(page.locator('#selection-fmt-popover')).toBeHidden();
});

// The Search palette sits on top of the editor too: an open row menu closes, the bars wait underneath.
test('Search closes an open row menu and hides the selected-rows bars', async ({ page }) => {
  await row(page, 2).locator('.node-dot').click({ button: 'right' });
  await expect(page.locator('#context-menu')).toBeVisible();
  await page.keyboard.press('Control+/');
  await expect(page.locator('#qa-input')).toBeFocused();
  await expect(page.locator('#global-search-wrap')).toHaveClass(/qa-open/);
  await expect(page.locator('#context-menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await row(page, 1).locator('.node-dot').click();
  await row(page, 2).locator('.node-dot').click({ modifiers: ['Shift'] });
  await expect(page.locator('#row-sel-pill')).toBeVisible();
  await page.keyboard.press('Control+/');
  await expect(page.locator('#qa-input')).toBeFocused();
  await expect(page.locator('#global-search-wrap')).toHaveClass(/qa-open/);
  await expect(page.locator('#row-sel-pill')).toBeHidden();
  await expect(page.locator('#selection-fmt-popover')).toBeHidden();
});
