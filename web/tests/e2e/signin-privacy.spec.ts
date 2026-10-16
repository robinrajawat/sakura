import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const hubPath = path.resolve(__dirname, '../../hub.html');

test('sign-in screen says what gets stored, and links to the full privacy section', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    // @ts-expect-error — global from index.html
    showLandingOverlay();
  });
  const details = page.locator('#sakura-landing-privacy');
  await expect(details.locator('summary')).toHaveText('What gets stored?');
  await expect(details.locator('ul')).toBeHidden();
  await details.locator('summary').click();
  await expect(details.locator('ul')).toContainText('No ads, no analytics, no tracking.');

  await page.locator('#sakura-landing-privacy-link').click();
  await expect(page.locator('#sakura-landing-overlay')).toBeHidden();
  await expect(page.locator('#settings-section-about-privacy')).toBeVisible();
  // Hiding to read the details is not "continue without signing in".
  expect(await page.evaluate(() => sessionStorage.getItem('sakura_landing_dismissed'))).toBeNull();
});

test('hub sign-in screen says what gets stored', async ({ page }) => {
  await page.goto('file://' + hubPath);
  const details = page.locator('#auth-privacy');
  await expect(details.locator('summary')).toBeVisible();
  await details.locator('summary').click();
  await expect(details.locator('ul')).toContainText('Your documents, folders, To-Dos and settings');
});
