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

// The one layout has no status bar (owner, 2026-10-28): word count, depth and "Saved …" never show;
// only a failed save speaks up, at the bottom-right.
test('word count, depth and Saved stay out of sight; a failed save shows', async ({ page }) => {
  await page.click('#es-first-row-btn');
  await page.keyboard.type('Hello', { delay: 30 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#sb-wordcount')).toBeHidden();
  await expect(page.locator('#sb-depth')).toBeHidden();
  await expect(page.locator('#sb-saved')).toBeHidden();
  await page.evaluate(() => (window as any).eval('storageWriteFailed = true; updateSavedIndicator()'));
  await expect(page.locator('#sb-saved')).toBeVisible();
  await expect(page.locator('#sb-saved')).toContainText('Not saved');
});
