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

// Owner 2026-11-21: a name or PDF mark changed on another device didn't show here until a reload.
// Settings arriving from the account (loadPrefs + showPrefs, as the sync listener does) show at once,
// and a box being typed in is left alone.
test('Settings that arrive from another device show without a reload', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await expect(page.locator('#preview-branding-text-input')).toHaveValue('SAKURA');
  const arrive = (prefs: object) => page.evaluate((p) => {
    localStorage.setItem('sakura_v001_prefs', JSON.stringify(p));
    (window as unknown as { loadPrefs: () => void; showPrefs: () => void }).loadPrefs();
    (window as unknown as { showPrefs: () => void }).showPrefs();
  }, prefs);
  await arrive({ pdfMark: 'ACME', defaultAuthorName: 'Robin', coverPageEnabled: false });
  await expect(page.locator('#preview-branding-text-input')).toHaveValue('ACME');
  await expect(page.locator('#default-author-input')).toHaveValue('Robin');
  await expect(page.locator('#cover-page-toggle')).toHaveAttribute('aria-checked', 'false');
  // Typing in the box: Settings open on the PDF mark's page.
  await page.evaluate(() => {
    document.getElementById('settings-panel')!.classList.add('open');
    const cat = document.getElementById('preview-branding-text-input')!.closest('[data-cat]')?.getAttribute('data-cat');
    (document.querySelector(`#settings-rail .settings-rail-btn[data-cat="${cat}"]`) as HTMLElement | null)?.click();
  });
  await page.locator('#preview-branding-text-input').fill('TYPING');
  await expect(page.locator('#preview-branding-text-input')).toBeFocused();
  await arrive({ pdfMark: 'OTHER', defaultAuthorName: 'Robin' });
  await expect(page.locator('#preview-branding-text-input')).toHaveValue('TYPING');
});
