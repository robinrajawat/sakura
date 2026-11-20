import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Startup runs last in the main script (#915), so a Settings field filled in by a top-level call
// further up showed the default instead of the saved value (2026-11-20: a saved PDF mark showed as
// "SAKURA"). Settings shows what was saved.
test('Settings shows the saved PDF mark and switches, not the defaults', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_v001_prefs', JSON.stringify({ pdfMark: 'ACME', errorReportsOff: true, coverPageEnabled: false }));
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await expect(page.locator('#preview-branding-text-input')).toHaveValue('ACME');
  await expect(page.locator('#auto-error-report-toggle')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#cover-page-toggle')).toHaveAttribute('aria-checked', 'false');
});
