import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.use({ colorScheme: 'dark' });

async function open(page: import('@playwright/test').Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { setThemeMode?: unknown }).setThemeMode === 'function');
}
const activeSeg = (page: import('@playwright/test').Page) => page.locator('#theme-segmented .theme-seg.active');

test('a first visit follows the device (dark here); Light is a lasting pick; System follows again', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await open(page);
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await expect(activeSeg(page)).toHaveText('System');

  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('settings-panel')?.classList.add('open');
  });
  await page.locator('#theme-segmented .theme-seg', { hasText: 'Light' }).click();
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  await expect(activeSeg(page)).toHaveText('Light');

  await open(page);
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  await expect(activeSeg(page)).toHaveText('Light');

  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('settings-panel')?.classList.add('open');
  });
  await page.locator('#theme-segmented .theme-seg', { hasText: 'System' }).click();
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await expect(activeSeg(page)).toHaveText('System');
});

test('someone who already chose a theme keeps it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_v001_prefs', JSON.stringify({ theme: 'light', themeMode: 'manual' }));
  });
  await open(page);
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  await expect(activeSeg(page)).toHaveText('Light');
});
