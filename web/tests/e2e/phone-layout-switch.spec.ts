import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, ground rule 1: the desktop is never in the phone layout, and a desktop
// window narrowed below 768px switches to it (and back) without a reload.
test('desktop widths are never the phone layout; narrowing the window switches it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + indexPath);
  const html = page.locator('html');
  // @ts-expect-error -- bare global from index.html
  const phone = () => page.evaluate(() => isPhoneLayout() as boolean);
  for (const width of [1280, 1024, 800, 768]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await phone(), `at ${width}px`).toBe(false);
    await expect(html).not.toHaveClass(/(^|\s)phone(\s|$)/);
  }
  await page.setViewportSize({ width: 767, height: 800 });
  await expect(html).toHaveClass(/(^|\s)phone(\s|$)/);
  expect(await phone()).toBe(true);
  // Narrowing never redirects mid-session.
  expect(page.url()).toContain('index.html');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(html).not.toHaveClass(/(^|\s)phone(\s|$)/);
});

test('the desktop has no ☰ button, drawer or phone back button', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#phone-menu-btn')).toBeHidden();
  await expect(page.locator('#phone-drawer-backdrop')).toBeHidden();
  // The back button sits in the To-Dos header, so check it with To-Dos open. (The pixel guard can't
  // see new markup: it shows with or without phone.css. Phone-only elements must be checked here.)
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  await expect(page.locator('#todos-phone-back')).toBeHidden();
  await page.locator('#dock-panel-appbar-toggle').click();
  // The rail's Documents button still opens and closes the File Explorer, as before.
  // @ts-expect-error -- bare global from index.html
  const open = () => page.evaluate(() => sidebarOpen as boolean);
  const start = await open();
  await page.locator('#rail-docs-btn').click();
  expect(await open()).toBe(!start);
  await page.locator('#rail-docs-btn').click();
  expect(await open()).toBe(start);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => { setPhoneDrawerOpen(true); return document.documentElement.classList.contains('phone-drawer-open'); })).toBe(false);
});

test('the desktop never shows the phone row toolbar or row menu', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + indexPath);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'Row' })]; nextId = 2; render(); });
  await page.locator('.node-row .node-label').first().click();
  // @ts-expect-error -- bare global from index.html
  await expect.poll(() => page.evaluate(() => editingId)).toBe(1);
  await expect(page.locator('#phone-edit-bar')).toBeHidden();
  await expect(page.locator('#phone-row-menu')).toBeHidden();
});
