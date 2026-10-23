import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The node right-click menu is the shared menu (owner, 2026-10-23: one menu everywhere): same look,
// keys and edge placement as every other right-click menu. The quick row stays on top; More folds
// open in place and its Insert › / Row › are the shared flyouts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    nodes = [n(1, 0, 'Alpha'), n(2, 0, 'Bravo')].map(normalizeNode); rebuildParentIds(); nextId = 3;
    collapsedIds = new Set(); selectedId = null; editingId = null; undoStack = []; render();`));
});

test('it is the shared menu: quick row on top, More folds open, keys work, Esc closes', async ({ page }) => {
  await page.locator('.node-row[data-id="2"]').click({ button: 'right' });
  const menu = page.locator('#context-menu');
  await expect(menu).toHaveClass(/sb-context-menu/);
  await expect(page.locator('.sb-context-menu')).toHaveCount(1);
  await expect(menu.locator('#context-quickbar .pv-qm-mark')).toHaveCount(3);
  await expect(page.locator('#context-more-panel')).toHaveCount(0);
  await page.locator('#context-more-toggle').click();
  await expect(page.locator('#context-more-panel')).toBeVisible();
  // Arrow keys walk the items, Enter runs one: Move up on row 2.
  const moveUp = page.locator('#context-more-panel [data-action="up"]');
  for (let i = 0; i < 40 && !(await moveUp.evaluate((b) => b.classList.contains('sb-context-active'))); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).eval('nodes.map(n => n.text)'))).toEqual(['Bravo', 'Alpha']);
  await page.locator('.node-row[data-id="2"]').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('a marker in the top row sets the row marker', async ({ page }) => {
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  await page.locator('#context-quickbar .pv-qm-mark[data-marker="followup"]').click();
  expect(await page.evaluate(() => (window as any).eval('nodes[0].marker'))).toBe('followup');
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  await expect(page.locator('#context-quickbar .pv-qm-mark[data-marker="followup"]')).toHaveClass(/active/);
});

test('pinning from More keeps the menu open with More unfolded and the new icon in the quick row', async ({ page }) => {
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  await page.locator('#context-quickbar [data-action="image"]').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Remove from quick row' }).click();
  // Customising reopens the node menu where it was.
  await expect(page.locator('#context-menu')).toBeVisible();
  await expect(page.locator('#context-quickbar [data-action="image"]')).toHaveCount(0);
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel [data-flyout="insert"]').hover();
  await page.locator('#context-menu .ctx-pin[data-pin="image"]').click({ force: true });
  await expect(page.locator('#context-quickbar [data-action="image"]')).toHaveCount(1);
  await expect(page.locator('#context-more-panel')).toBeVisible();
});
