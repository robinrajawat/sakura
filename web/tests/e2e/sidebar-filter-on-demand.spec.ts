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

test('the filter box starts hidden and the search icon opens it focused', async ({ page }) => {
  const box = page.locator('#sidebar-search-wrap');
  await expect(box).toBeHidden();
  await page.click('#sb-toggle-search-btn');
  await expect(box).toBeVisible();
  await expect(page.locator('#sidebar-search')).toBeFocused();
});

test('Esc closes the filter box and clears it', async ({ page }) => {
  await page.click('#sb-toggle-search-btn');
  await page.keyboard.type('abc');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar-search-wrap')).toBeHidden();
  await expect(page.locator('#sidebar-search')).toHaveValue('');
});

test('an empty filter box closes when it loses focus; one with words stays', async ({ page }) => {
  const box = page.locator('#sidebar-search-wrap');
  await page.click('#sb-toggle-search-btn');
  await page.keyboard.type('abc');
  await page.click('#editor-pane-inner');
  await page.waitForTimeout(250);
  await expect(box).toBeVisible();
  await page.click('#sidebar-search-clear');
  await page.click('#editor-pane-inner');
  await expect(box).toBeHidden();
});
