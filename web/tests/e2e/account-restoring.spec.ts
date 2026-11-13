import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner bug 2026-11-13: on refresh the account menu said "Sign in" for a few seconds before the
// account came back. While a browser that was signed in restores its session, the menu says
// "Signing you in…" and the button never shows "Sign in".
test('a returning account shows "Signing you in…" until the session is back, never "Sign in"', async ({ page }) => {
  await page.route('**/firebasejs/**', () => { /* a slow connection: the restore doesn't finish */ });
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_account_active', 'true');
  });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#account-toggle-label')).toBeHidden();
  await page.evaluate(() => document.getElementById('account-toggle')!.click());
  await expect(page.locator('#account-restoring')).toHaveText('Signing you in…');
  await expect(page.locator('#account-signed-out')).toBeHidden();
  // The session turns out to be gone: now Sign in shows.
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    updateAccountUI(null);
  });
  await expect(page.locator('#account-restoring')).toBeHidden();
  await expect(page.locator('#account-signed-out')).toBeVisible();
});

test('a browser that never signed in shows Sign in straight away', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('account-toggle')!.click());
  await expect(page.locator('#account-signed-out')).toBeVisible();
  await expect(page.locator('#account-restoring')).toBeHidden();
});
