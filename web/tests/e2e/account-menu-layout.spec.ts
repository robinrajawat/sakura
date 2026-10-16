import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

// Shows the signed-in part of the menu the way updateAccountUI does, without Firebase.
async function showSignedIn(page) {
  await page.evaluate(() => {
    document.getElementById('account-signed-out')!.style.display = 'none';
    document.getElementById('account-signed-in')!.style.display = '';
    document.getElementById('account-signout-wrap')!.style.display = '';
    document.getElementById('account-name')!.textContent = 'Robin';
    document.getElementById('account-email')!.textContent = 'robin@example.com';
    // @ts-expect-error — global from index.html
    updateSyncStatusUI('synced');
    // @ts-expect-error — global from index.html
    updateProfileDiscoverableToggleUi();
  });
}

const visibleItems = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#account-menu .export-item')]
      .filter((b) => (b as HTMLElement).offsetParent !== null)
      .map((b) => b.id),
  );

test('signed out: three items and support, no sign out or About', async ({ page }) => {
  await page.locator('#account-toggle').click();
  expect(await visibleItems(page)).toEqual([
    'account-settings-btn',
    'account-help-btn',
    'account-feedback-btn',
    'account-support-btn',
  ]);
  await expect(page.locator('#account-about-btn')).toHaveCount(0);
  await expect(page.locator('#account-support-btn .export-icon')).toHaveCSS('color', 'rgb(192, 138, 30)');
});

test('signed in: sync and visibility share one line, sign out is last', async ({ page }) => {
  await showSignedIn(page);
  await page.locator('#account-toggle').click();
  const items = await visibleItems(page);
  expect(items[items.length - 1]).toBe('account-signout-btn');
  // Synced shows as a ring on the avatar, not as text, so the line doesn't change width.
  await expect(page.locator('#account-manage-btn')).toHaveClass(/sync-synced/);
  await expect(page.locator('#account-sync-status')).toBeHidden();
  await expect(page.locator('#account-meta-sep')).toBeHidden();
  await expect(page.locator('#account-visibility-badge')).toHaveText(/Private profile/);
});

test('a sync error still shows words next to the red ring', async ({ page }) => {
  await showSignedIn(page);
  // @ts-expect-error — global from index.html
  await page.evaluate(() => updateSyncStatusUI('error'));
  await page.locator('#account-toggle').click();
  await expect(page.locator('#account-manage-btn')).toHaveClass(/sync-error/);
  await expect(page.locator('#account-sync-status')).toHaveText('Sync error');
  await expect(page.locator('#account-meta-sep')).toBeVisible();
});

test('header opens Settings → Account; visibility link does not', async ({ page }) => {
  await showSignedIn(page);
  await page.locator('#account-toggle').click();
  await page.locator('#account-visibility-badge').click();
  await expect(page.locator('#settings-panel')).not.toHaveClass(/open/);
  await page.locator('#account-name').click();
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
  await expect(page.locator('#settings-panel .settings-rail-btn[data-cat="account"]')).toHaveClass(/active/);
});

test('Help → About Sakura opens Settings → About', async ({ page }) => {
  await page.locator('#account-toggle').click();
  await page.locator('#account-help-btn').click();
  await expect(page.locator('#help-panel')).toHaveClass(/open/);
  await page.locator('#help-about-open-btn').click();
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
  await expect(page.locator('#settings-panel .settings-rail-btn[data-cat="about"]')).toHaveClass(/active/);
});
