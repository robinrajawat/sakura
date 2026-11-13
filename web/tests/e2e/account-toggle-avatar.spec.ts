import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-13 (iPhone and Mac Safari): the account button showed the generic person icon
// beside the photo. The icon was hidden by :has([style*="inline"]) on the photo's wrapper, which
// Safari doesn't re-check when the style attribute changes. A class on the button says it now.
const PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#79a"/></svg>');

test('signed in with a photo: the photo only, no person icon; signed out: the icon is back', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  const toggle = page.locator('#account-toggle');
  const icon = () => toggle.evaluate((e) => getComputedStyle(e, '::before').content);
  expect(await icon()).not.toBe('none');
  await page.evaluate((photo) => {
    // @ts-expect-error -- bare global from index.html
    updateAccountUI({ uid: 'u1', displayName: 'Robin', email: 'r@example.com', photoURL: photo });
  }, PHOTO);
  await expect(toggle).toHaveClass(/(^|\s)has-avatar(\s|$)/);
  await expect(page.locator('#account-toggle-avatar-wrap')).toBeVisible();
  expect(await icon()).toBe('none');
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    updateAccountUI(null);
  });
  await expect(toggle).not.toHaveClass(/(^|\s)has-avatar(\s|$)/);
  expect(await icon()).not.toBe('none');
});
