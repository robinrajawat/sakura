import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Every window-sized dialog shares one frame: title (and grey line under it) on the left, the same ×
// on the right, Esc closes (owner, 2026-10-23: "elegant, standard and unified").
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
});

test('dialogs share one head with the same close button', async ({ page }) => {
  for (const id of ['feedback-modal-overlay', 'feedback-inbox-modal-overlay', 'account-delete-modal-overlay', 'shortcuts-modal-overlay', 'cheatsheet-overlay', 'history-modal-overlay', 'icon-library-overlay']) {
    await expect(page.locator(`#${id} .app-modal-head h2`), id).toHaveCount(1);
    await expect(page.locator(`#${id} .app-modal-head .app-modal-close-btn svg`), id).toHaveCount(1);
  }
});

test('Version history: × and Esc close it; the document name sits under the title', async ({ page }) => {
  await page.evaluate(() => (window as any).eval('ensureDocumentForEditing(); openVersionHistory(currentDocId); 0'));
  const ov = page.locator('#history-modal-overlay');
  await expect(ov).toHaveClass(/open/);
  await expect(page.locator('#history-modal-overlay .app-modal-head h2')).toHaveText('Version history');
  await expect(page.locator('#history-modal-docname')).toHaveText('Untitled');
  await page.keyboard.press('Escape');
  await expect(ov).not.toHaveClass(/open/);
  await page.evaluate(() => (window as any).eval('openIconLibrary(); 0'));
  await expect(page.locator('#icon-library-overlay')).toHaveClass(/open/);
  await page.locator('#icon-library-close').click();
  await expect(page.locator('#icon-library-overlay')).not.toHaveClass(/open/);
});
