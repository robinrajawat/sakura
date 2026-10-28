import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');

// Quick Assist opens with nothing under an empty box (owner, 2026-10-28: the "Try things like"
// examples were filler); results show once you type.
test('an empty Quick Assist box shows no examples; typing shows results', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.keyboard.press('Control+/');
  await expect(page.locator('#qa-input')).toBeFocused();
  await expect(page.locator('#qa-hint')).toHaveCount(0);
  await expect(page.locator('#qa-dropdown')).toBeHidden();
  await page.keyboard.type('dark');
  await expect(page.locator('#qa-dropdown')).toBeVisible();
  await expect(page.locator('#qa-results .qa-item').first()).toBeVisible();
});
