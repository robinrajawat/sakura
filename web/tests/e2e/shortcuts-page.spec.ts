import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// One Shortcuts page in Settings, no popups (owner 2026-11-01): Help's "Keyboard shortcuts" opens it,
// it lists every shortcut, searches, and a combo can be changed and reset in place.
test('Help › Keyboard shortcuts opens Settings › Shortcuts, which searches and edits in place', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
  await expect(page.locator('#cheatsheet-overlay, #shortcuts-modal-overlay')).toHaveCount(0);
  await page.evaluate(() => document.getElementById('help-panel')!.classList.add('open'));
  await page.locator('#cheatsheet-open-btn').click();
  await expect(page.locator('#settings-panel.open')).toHaveCount(1);
  await expect(page.locator('#help-panel.open')).toHaveCount(0);
  await expect(page.locator('#settings-rail .settings-rail-btn.active')).toHaveText('Shortcuts');
  const rows = page.locator('#shortcuts-list .shortcut-row:visible');
  expect(await rows.count()).toBeGreaterThan(10);
  await page.locator('#shortcuts-search').fill('bold');
  await expect(rows.first()).toContainText(/bold/i);
  expect(await rows.count()).toBeLessThan(4);
  // Change Bold to Ctrl+Alt+J, then reset it.
  await rows.first().locator('.shortcut-combo-btn').click();
  await page.keyboard.press('Control+Alt+j');
  await expect(rows.first().locator('.shortcut-custom-tag')).toBeVisible();
  await rows.first().locator('.shortcut-reset-btn').click();
  await expect(rows.first().locator('.shortcut-custom-tag')).toHaveCount(0);
  // Esc in the search clears it, then leaves it; Settings stays open.
  await page.locator('#shortcuts-search').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcuts-search')).toHaveValue('');
  await expect(page.locator('#settings-panel.open')).toHaveCount(1);
});
