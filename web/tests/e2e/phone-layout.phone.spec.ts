import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 0: on a phone, ?layout=phone keeps this page (the phone layout being
// built) instead of sending it to hub.html, which stays the default until phase 5.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
});

test('a phone still goes to hub.html by default', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.waitForURL(/hub\.html/);
});

test('?layout=phone stays here, in the phone layout', async ({ page }) => {
  await page.goto('file://' + indexPath + '?layout=phone');
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  expect(page.url()).toContain('index.html');
  await expect(page.locator('html')).toHaveClass(/(^|\s)phone(\s|$)/);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => isPhoneLayout())).toBe(true);
});
