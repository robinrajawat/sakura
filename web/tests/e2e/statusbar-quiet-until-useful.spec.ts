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

test('Depth and Saved stay hidden until they have something to say', async ({ page }) => {
  await expect(page.locator('#sb-wordcount')).toBeVisible();
  await expect(page.locator('#sb-depth')).toBeHidden();
  await expect(page.locator('#sb-depth-divider')).toBeHidden();
  await expect(page.locator('#sb-saved')).toBeHidden();
  await expect(page.locator('#statusbar')).not.toContainText('—');

  await page.click('#es-first-row-btn');
  await page.keyboard.type('Hello', { delay: 30 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#sb-depth')).toHaveText('Depth 0');
  await expect(page.locator('#sb-depth-divider')).toBeVisible();
  await expect(page.locator('#sb-saved')).toContainText('Saved');
});
