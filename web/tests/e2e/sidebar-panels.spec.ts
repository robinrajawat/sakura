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
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('app-layout')!.getBoundingClientRect().left))).toBe(52 + Math.round(box.width) + 80);
  expect(await page.evaluate(() => localStorage.getItem('sakura_dock_panel_width_v1'))).toBe(String(Math.round(box.width) + 80));
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

test('Notifications open full height beside the rail, with the same header as the other panels', async ({ page }) => {
  await page.locator('#notif-toggle').click();
  const menu = page.locator('#notif-menu');
  await expect(menu).toBeVisible();
  const r = (await menu.boundingBox())!;
  expect(Math.round(r.x)).toBe(52);
  expect(Math.round(r.y)).toBe(0);
  expect(Math.round(r.height)).toBe(760);
  const font = (sel: string) => page.locator(sel).evaluate((e) => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.textTransform].join(' '); });
  expect(await font('.notif-menu-title')).toBe(await font('#sidebar .sb-section-label'));
  expect(await font('.notif-menu-title')).toBe('14.5px 600 none');
});

test('back/forward are shortcuts only: no buttons on the top line', async ({ page }) => {
  await expect(page.locator('.doc-nav-btn')).toHaveCount(0);
  await expect(page.locator('#doc-path')).toBeAttached();
});
