import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-22: show password on the sign-in screen, as most sign-in screens have. Hidden to
// start with; the eye shows it and hides it again, keeps the caret in the field, and closing the
// email form hides it again.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await page.locator('#sakura-landing-email-toggle-btn').click();
});

test('the eye shows and hides the password, and the field keeps the focus', async ({ page }) => {
  const pw = page.locator('#sakura-landing-password-input');
  const eye = page.locator('#sakura-landing-password-toggle');
  await expect(pw).toHaveAttribute('type', 'password');
  await expect(eye).toHaveAttribute('aria-label', 'Show password');
  await expect(eye).toHaveAttribute('aria-pressed', 'false');
  await pw.fill('hunter22');
  await eye.click();
  await expect(pw).toHaveAttribute('type', 'text');
  await expect(eye).toHaveAttribute('aria-label', 'Hide password');
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await expect(pw).toBeFocused();
  await expect(pw).toHaveValue('hunter22');
  await eye.click();
  await expect(pw).toHaveAttribute('type', 'password');
});

test('the eye sits inside the field, and text never runs under it', async ({ page }) => {
  const box = (await page.locator('#sakura-landing-password-input').boundingBox())!;
  const eye = (await page.locator('#sakura-landing-password-toggle').boundingBox())!;
  expect(eye.x).toBeGreaterThan(box.x + box.width / 2);
  expect(eye.x + eye.width).toBeLessThanOrEqual(box.x + box.width);
  expect(eye.y).toBeGreaterThanOrEqual(box.y);
  expect(eye.y + eye.height).toBeLessThanOrEqual(box.y + box.height);
  const padRight = await page.locator('#sakura-landing-password-input').evaluate((e) => parseFloat(getComputedStyle(e).paddingRight));
  expect(padRight).toBeGreaterThanOrEqual(eye.width);
});
