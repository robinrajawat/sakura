import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Help's About and Keyboard shortcuts rows open a Settings page. Settings then shows "‹ Help" (like
// macOS System Settings); it or Esc goes back to the same Help page (owner 2026-11-02: "do what is standard").
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
});

test('About from Help shows ‹ Help, which returns to Help', async ({ page }) => {
  await page.evaluate(() => document.getElementById('help-toggle')!.click());
  await expect(page.locator('#help-panel.open')).toHaveCount(1);
  await page.locator('#help-about-open-btn').click();
  await expect(page.locator('#settings-panel.open')).toHaveCount(1);
  await expect(page.locator('#settings-rail .settings-rail-btn.active')).toHaveText('About');
  await expect(page.locator('#settings-back-btn')).toBeVisible();
  await page.locator('#settings-back-btn').click();
  await expect(page.locator('#help-panel.open')).toHaveCount(1);
  await expect(page.locator('#settings-panel.open')).toHaveCount(0);
});

test('Keyboard shortcuts from Help: Esc goes back to Help; Settings opened normally has no back link', async ({ page }) => {
  await page.evaluate(() => document.getElementById('help-toggle')!.click());
  await page.locator('#cheatsheet-open-btn').click();
  await expect(page.locator('#settings-rail .settings-rail-btn.active')).toHaveText('Shortcuts');
  await expect(page.locator('#settings-back-btn')).toBeVisible();
  await page.locator('#settings-content').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-panel.open')).toHaveCount(1);
  await expect(page.locator('#settings-panel.open')).toHaveCount(0);
  await page.locator('#rail-settings-btn').click();
  await expect(page.locator('#settings-panel.open')).toHaveCount(1);
  await expect(page.locator('#settings-back-btn')).toBeHidden();
});
