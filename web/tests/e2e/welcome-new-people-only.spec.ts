import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-22: after signing in on a new iPad the welcome dialog appeared instead of the
// documents loading. It had opened 0.5 s after start, hidden behind the sign-in screen, and showed
// once that went away. The welcome is for someone new: a first visit without an account, or an
// account just created; never an existing account signing in.

const welcomeOpen = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.getElementById('welcome-overlay')!.classList.contains('open'));

async function load(page: import('@playwright/test').Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
}

test('not opened behind the sign-in screen', async ({ page }) => {
  await load(page);
  await expect(page.locator('#sakura-landing-overlay')).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await welcomeOpen(page)).toBe(false);
});

test('a first visit that tries it without an account gets the welcome', async ({ page }) => {
  await load(page);
  await page.locator('#sakura-landing-continue-btn').click();
  await expect(page.locator('#welcome-overlay')).toHaveClass(/\bopen\b/);
});

test('an existing account signing in never gets it, and it stays away on this device', async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    (window as unknown as { hideLandingOverlay: () => void }).hideLandingOverlay();
    (window as unknown as { welcomeAfterSignIn: (n: boolean) => void }).welcomeAfterSignIn(false);
  });
  await page.waitForTimeout(800);
  expect(await welcomeOpen(page)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('sakura_welcome_seen'))).toBe('true');
});

test('a new account gets the welcome once signed in', async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    localStorage.setItem('sakura_account_active', 'true');
    (window as unknown as { hideLandingOverlay: () => void }).hideLandingOverlay();
    (window as unknown as { welcomeAfterSignIn: (n: boolean) => void }).welcomeAfterSignIn(true);
  });
  await expect(page.locator('#welcome-overlay')).toHaveClass(/\bopen\b/);
});

test('a returning signed-in device never gets it at start-up', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_account_active', 'true'));
  await load(page);
  await page.waitForTimeout(1200);
  expect(await welcomeOpen(page)).toBe(false);
});
