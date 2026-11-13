import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const hubPath = path.resolve(__dirname, '../../hub.html');

// docs/mobile-plan.md, phase 5: one app for every screen. A phone opens index.html in its phone
// layout; the old phone page (hub.html) only forwards here, keeping its query string, so
// bookmarks, home-screen icons and "Share to Sakura" keep working.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
});

const ready = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');

test('a phone stays on the app, in the phone layout', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await ready(page);
  await page.waitForTimeout(300);
  expect(page.url()).toContain('index.html');
  await expect(page.locator('html')).toHaveClass(/(^|\s)phone(\s|$)/);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => isPhoneLayout())).toBe(true);
  await expect(page.locator('#phone-menu-btn')).toBeVisible();
});

test('the old phone page forwards to the app, keeping the query string and hash', async ({ page }) => {
  await page.goto('file://' + hubPath + '?x=1#y');
  await page.waitForURL(/index\.html\?x=1#y$/);
  await ready(page);
});

test('"Share to Sakura" (through the old address too) adds a to-do, opens To-Dos and clears the share', async ({ page }) => {
  await page.goto('file://' + hubPath + '?share_title=Page&share_text=Read%20this&share_url=https%3A%2F%2Fa.example%2Fx');
  await page.waitForURL(/index\.html/);
  await ready(page);
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  await expect(page.locator('#todos-body')).toContainText('Read this — https://a.example/x');
  await expect(page.locator('#toast')).toContainText('Added to your To-Dos');
  expect(page.url()).not.toContain('share_');
  // A reload doesn't add it again.
  await page.reload();
  await ready(page);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]').filter((t: { text: string }) => t.text.startsWith('Read this')).length);
  expect(n).toBe(1);
});
