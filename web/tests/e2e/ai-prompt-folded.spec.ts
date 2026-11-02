import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Settings → AI: the rewrite prompt is one line (what it does + Edit); Edit opens it in place and
// Save folds it again with the summary updated (2026-11-02).
test('the rewrite prompt is folded behind Edit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.locator('#rail-settings-btn').click();
  await page.locator('#settings-rail .settings-rail-btn[data-cat="ai"]').click();
  await expect(page.locator('#ai-prompt-input')).toBeHidden();
  await expect(page.locator('#ai-prompt-summary')).toHaveText('Fixes spelling and grammar (default).');
  await page.locator('#ai-prompt-edit-btn').click();
  await expect(page.locator('#ai-prompt-input')).toBeVisible();
  await expect(page.locator('#ai-prompt-edit-btn')).toHaveText('Done');
  await page.locator('#ai-prompt-input').fill('Make it formal.');
  await page.locator('#ai-prompt-save-btn').click();
  await expect(page.locator('#ai-prompt-input')).toBeHidden();
  await expect(page.locator('#ai-prompt-summary')).toHaveText('Your own prompt.');
  await page.locator('#ai-prompt-edit-btn').click();
  await page.locator('#ai-prompt-reset-btn').click();
  await expect(page.locator('#ai-prompt-summary')).toHaveText('Fixes spelling and grammar (default).');
});
