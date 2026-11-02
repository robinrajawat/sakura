import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// One sidebar look (owner 2026-10-29): Documents, To-Dos, Notifications, Settings and Help open beside
// the rail on the same flat surface with the same header; explorer rows are just names.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

test('To-Dos sits flat beside the rail; dragging its right edge resizes it and the width is kept', async ({ page }) => {
  await page.locator('#dock-panel-appbar-toggle').click();
  const panel = page.locator('#todos-panel');
  await expect(panel).toHaveClass(/open/);
  await expect(page.locator('#todos-panel-maximize, #todos-panel-close')).toHaveCount(0);
  expect(await panel.evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
  const box = (await panel.boundingBox())!;
  const handle = (await page.locator('#todos-resize-handle').boundingBox())!;
  expect(Math.abs(handle.x + handle.width / 2 - (box.x + box.width))).toBeLessThan(6);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 80, handle.y + 200, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(box.width) + 80);
  // The page moves over with it.
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('app-layout')!.getBoundingClientRect().left))).toBe(52 + Math.round(box.width) + 80 + 5);
  // One side panel width (owner 2026-11-02): the File Explorer and Help take the same width.
  expect(await page.evaluate(() => localStorage.getItem('sakura_sidebar_width_v1'))).toBe(String(Math.round(box.width) + 80));
  expect(await page.evaluate(() => document.getElementById('sidebar')!.style.getPropertyValue('--sb-width'))).toBe((Math.round(box.width) + 80) + 'px');
});

test('explorer rows show just the name: no date, no hover buttons; double-click renames', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing(); el('header-title').value = 'Plan'; el('header-title').dispatchEvent(new Event('input')); saveToStorage(); setSidebarOpen(true); renderSidebar();
  });
  const row = page.locator('.sdoc-item', { hasText: 'Plan' }).first();
  await row.hover();
  await expect(row.locator('button.sdoc-action-btn, .sdoc-meta')).toHaveCount(0);
  await expect(row.locator('.sdoc-name-btn')).toHaveAttribute('data-tip', /^Plan · edited /);
  await expect(page.locator('.sfolder-actions')).toHaveCount(0);
  await row.locator('.sdoc-name-btn').dblclick();
  await expect(page.locator('.inline-edit-input')).toBeFocused();
  await expect(page.locator('.inline-edit-input')).toHaveValue('Plan');
});

test('a new document starts in its title', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { ensureDocumentForEditing(); createDoc(); });
  await expect(page.locator('#header-title')).toBeFocused();
});

// Notifications are a popover beside the bell (owner 2026-11-02, the standard for a few notices):
// it floats over the page next to the rail, leaves Documents and the page where they are, and closes
// on a click away or Esc.
test('Notifications open as a popover beside the bell and close on a click away or Esc', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => { if (!sidebarOpen) setSidebarOpen(true); });
  const ml = () => page.locator('#app-layout').evaluate((e) => getComputedStyle(e).marginLeft);
  const before = await ml();
  await page.locator('#notif-toggle').click();
  const menu = page.locator('#notif-menu');
  await expect(menu).toBeVisible();
  const r = (await menu.boundingBox())!;
  const bell = (await page.locator('#notif-toggle').boundingBox())!;
  expect(Math.round(r.x)).toBe(60);
  expect(r.height).toBeLessThan(600);
  expect(r.y + r.height).toBeGreaterThanOrEqual(bell.y + bell.height);
  expect(Math.round(r.width)).toBe(360);
  const font = (sel: string) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.textTransform].join(' '); });
  expect(await font('.notif-menu-title')).toBe('14.5px 600 none');
  await expect(page.locator('#sidebar')).toBeVisible();
  expect(await ml()).toBe(before);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.locator('#notif-toggle').click();
  await expect(menu).toBeVisible();
  await page.mouse.click(900, 400);
  await expect(menu).toBeHidden();
});

// An empty folder shows no "0" next to its name (owner 2026-11-02).
test('an empty folder shows no count', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    const fs = loadFolders(); fs.push({ id: 'fe', name: 'Empty', parentId: null }); saveFolders(fs); setSidebarOpen(true); renderSidebar();
  });
  const row = page.locator('.sfolder-row', { hasText: 'Empty' });
  await expect(row).toBeVisible();
  await expect(row.locator('.sfolder-count')).toHaveText('');
});

test('back/forward are shortcuts only: no buttons on the top line', async ({ page }) => {
  await expect(page.locator('.doc-nav-btn')).toHaveCount(0);
  await expect(page.locator('#doc-path')).toBeAttached();
});

// Opening Search keeps its slot on the rail, so To-Dos doesn't slide up under the pointer (owner 2026-10-29).
test('opening Search leaves the rail icons where they were', async ({ page }) => {
  const top = () => page.locator('#dock-panel-appbar-toggle').evaluate((b) => Math.round(b.getBoundingClientRect().top));
  const before = await top();
  await page.locator('#qa-category-icon-btn').click();
  await expect(page.locator('#global-search-wrap')).toHaveClass(/qa-open/);
  expect(await top()).toBe(before);
});
