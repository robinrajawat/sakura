import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('sign-in screen: email sign-in is a full-width button like Google, Continue sits on its own line', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')!.style.display = 'flex';
  });
  const google = await page.locator('#sakura-landing-google-signin-btn').boundingBox();
  const email = await page.locator('#sakura-landing-email-toggle-btn').boundingBox();
  const cont = await page.locator('#sakura-landing-continue-btn').boundingBox();
  expect(Math.round(email!.width)).toBe(Math.round(google!.width));
  expect(Math.round(email!.x)).toBe(Math.round(google!.x));
  expect(cont!.y).toBeGreaterThanOrEqual(email!.y + email!.height);
});
