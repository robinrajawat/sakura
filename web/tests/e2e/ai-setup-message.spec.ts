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

test('Rewrite with no AI key says what to set up and opens AI settings', async ({ page }) => {
  await page.click('#es-first-row-btn');
  await page.keyboard.type('fix teh data', { delay: 20 });
  await page.keyboard.press('Escape');
  await page.click('#qb-ai');
  await page.locator('#ai-menu .sb-context-label', { hasText: 'Rewrite row' }).click();
  await expect(page.locator('#sakura-modal-title')).toHaveText('Set up AI');
  await expect(page.locator('#sakura-modal-body')).toContainText('Settings › AI Rewrite');
  await expect(page.locator('#sakura-modal-actions button')).toHaveText(['Not now', 'Open settings']);
  await page.locator('#sakura-modal-actions button', { hasText: 'Open settings' }).click();
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
});

test('a real provider failure keeps its message, titled with the provider name', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error — global from index.html
    showAiErrorModal('gemini', new Error('Quota exceeded'));
  });
  await expect(page.locator('#sakura-modal-title')).toHaveText('Gemini error');
  await expect(page.locator('#sakura-modal-body')).toHaveText('Quota exceeded');
  await expect(page.locator('#sakura-modal-actions button')).toHaveText(['Copy', 'Dismiss']);
});
