import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-19, on an iPhone: "the app is broken, I can't even tap the account or the sidebar".
// Two phone bugs: Sakura's question dialogs sat behind the full-screen Settings / Help / To-Dos
// sheets, invisible but taking every tap; and a narrow-screen rule meant for the top bar hid most
// of Settings' buttons (Download all data, Import, Empty trash, Delete account…) on every phone.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await page.evaluate(() => {
    document.getElementById('settings-toggle')!.click();
    (document.querySelector('.settings-rail-btn[data-cat="about"]') as HTMLElement).click();
  });
});

test('a dialog opened from Settings shows in front of it and takes the taps, not something hidden', async ({ page }) => {
  await page.locator('#about-storage-check-btn').tap();
  await expect(page.locator('#sakura-modal-title')).toHaveText('Storage details');
  const onTop = await page.evaluate(() => {
    const r = document.getElementById('sakura-modal')!.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && !!hit.closest('#sakura-modal');
  });
  expect(onTop).toBe(true);
  await page.locator('#sakura-modal-actions button', { hasText: 'Close' }).tap();
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/\bopen\b/);
});

test('Settings’ own buttons show on a phone', async ({ page }) => {
  for (const id of ['about-storage-check-btn', 'sb-export-all-btn', 'sb-empty-trash-btn', 'account-delete-open-btn', 'open-feedback-modal-btn']) {
    const shown = await page.evaluate((id) => { const b = document.getElementById(id); return !!b && getComputedStyle(b).display !== 'none'; }, id);
    expect(shown, id).toBe(true);
  }
  // The top bar keeps its narrow-screen layout: its account button is still there.
  await expect(page.locator('#account-toggle')).toBeVisible();
});
