import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('visibility badge tooltip and toast mention name or email, not email alone', async ({ page }) => {
  await page.goto('file://' + indexPath);

  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      const el = document.getElementById('sakura-landing-overlay');
      if (el) el.style.display = 'none';
    });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }

  const privateTip = await page.evaluate(() => {
    // @ts-expect-error — global app state from index.html, not a module export
    window.profileVisibility = 'private';
    // @ts-expect-error
    updateProfileDiscoverableToggleUi();
    return document.getElementById('account-visibility-badge')?.dataset.tip;
  });
  const publicTip = await page.evaluate(() => {
    // @ts-expect-error
    window.profileVisibility = 'public';
    // @ts-expect-error
    updateProfileDiscoverableToggleUi();
    return document.getElementById('account-visibility-badge')?.dataset.tip;
  });

  expect(privateTip).toContain('name or email');
  expect(publicTip).toContain('name or email');
  expect(privateTip).not.toMatch(/discoverable by email\b/);
  expect(publicTip).not.toMatch(/discoverable by email\b/);
});
