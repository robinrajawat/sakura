import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-23: More is a ⋯ at the end of the quick row, not a line of its own.
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

test('⋯ is the last icon of the quick row and unfolds More below it', async ({ page }) => {
  await page.locator('.node-row[data-id="2"]').click({ button: 'right' });
  const menu = page.locator('#context-menu');
  // The menu is one strip: the quick row and nothing else.
  expect(await menu.evaluate((m) => [...m.children].map((c) => c.id))).toEqual(['context-quickbar']);
  const last = await page.locator('#context-quickbar > *').last().evaluate((b) => b.id);
  expect(last).toBe('context-more-toggle');
  const dots = page.locator('#context-more-toggle');
  await expect(dots).toHaveAttribute('aria-expanded', 'false');
  await dots.click();
  await expect(dots).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#context-more-panel [data-action="up"]')).toBeVisible();
  // Folding it again keeps the menu open.
  await dots.click();
  await expect(page.locator('#context-more-panel')).toHaveCount(0);
  await expect(menu).toBeVisible();
});

test('unfolding ⋯ near the bottom of the window moves the menu up instead of scrolling it', async ({ page }) => {
  await page.evaluate(() => (window as any).eval(`
    nodes = Array.from({ length: 40 }, (_, i) => normalizeNode({ id: i + 1, depth: 0, text: 'Row ' + (i + 1), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }));
    rebuildParentIds(); nextId = 41; render();`));
  // Right-click the last row that is fully on screen.
  const id = await page.evaluate(() => [...document.querySelectorAll('.node-row')].filter((r) => r.getBoundingClientRect().bottom < window.innerHeight - 40).pop()!.getAttribute('data-id'));
  await page.locator(`.node-row[data-id="${id}"]`).click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  const m = await page.locator('#context-menu').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, bottom: el.getBoundingClientRect().bottom, vh: window.innerHeight }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  expect(m.bottom).toBeLessThanOrEqual(m.vh);
});

test('right-clicking a quick-row icon keeps the node menu open, with its options under the icon', async ({ page }) => {
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  const icon = page.locator('#context-quickbar [data-action="note"]');
  await icon.click({ button: 'right' });
  await expect(page.locator('#context-menu')).toBeVisible();
  const flyout = page.locator('#context-menu .sb-context-submenu');
  await expect(flyout).toContainText('Remove from quick row');
  const [ib, fb] = [(await icon.boundingBox())!, (await flyout.boundingBox())!];
  expect(fb.y).toBeGreaterThan(ib.y + ib.height - 1);
  await flyout.getByText('Move right').click();
  await expect(page.locator('#context-menu')).toBeVisible();
});
