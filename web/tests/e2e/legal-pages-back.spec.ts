import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-18: the privacy policy and terms open in a new tab from the app, and their
// "Back to Sakura Notes" link used to open a second copy of the app in that tab. Opened from the
// app (?from=app) it now closes its own tab, returning to the app tab; arriving any other way it
// is an ordinary link.

test('opened from the app: Back closes the policy tab instead of opening the app again', async ({ page, context }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { render?: unknown }).render === 'function');
  await page.evaluate(() => {
    document.getElementById('settings-toggle')!.click();
    (document.querySelector('.settings-rail-btn[data-cat="about"]') as HTMLElement).click();
  });
  const link = page.locator('#settings-section-about-privacy a[href="privacy.html?from=app"]');
  await expect(link).toHaveAttribute('target', '_blank');
  // Under file:// the policy page sits in public/, beside index.html only in the build, so open the
  // source page through a link of the same kind (new tab, same query), clicked like a person would.
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate((href) => {
    const a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'policy';
    document.body.appendChild(a); a.click();
  }, 'file://' + path.join(publicDir, 'privacy.html') + '?from=app');
  const policy = await popupPromise;
  await policy.waitForLoadState();
  // The link to the terms keeps the mark, so Back works there too.
  await expect(policy.locator('.foot a[href^="terms.html"]')).toHaveAttribute('href', 'terms.html?from=app');
  const closed = policy.waitForEvent('close');
  await policy.locator('.back a').click();
  await closed;
  expect(context.pages()).toEqual([page]);
});

test('arriving directly: Back is an ordinary link to the app', async ({ page }) => {
  await page.goto('file://' + path.join(publicDir, 'terms.html'));
  await expect(page.locator('.foot a[href="privacy.html"]')).toHaveCount(1);
  await page.locator('.back a').click();
  await expect(page).toHaveURL(/\/public\/$/);
});
