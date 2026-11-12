import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner bug 2026-11-12: on a new computer the editor showed for a moment before the sign-in
// screen. The screen is now shown by CSS from the moment its markup is parsed, before the app
// script runs. Records its display as soon as the element appears in the page.
async function displayWhenParsed(page: import('@playwright/test').Page, accountActive: boolean) {
  await page.addInitScript((active) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    if (active) localStorage.setItem('sakura_account_active', 'true');
    const w = window as unknown as { __landingAtParse?: string };
    new MutationObserver((_m, obs) => {
      const ov = document.getElementById('sakura-landing-overlay');
      if (!ov) return;
      w.__landingAtParse = getComputedStyle(ov).display;
      obs.disconnect();
    }).observe(document, { childList: true, subtree: true });
  }, accountActive);
  await page.goto('file://' + indexPath);
  return page.evaluate(() => (window as unknown as { __landingAtParse?: string }).__landingAtParse);
}

test('a browser that never signed in shows the sign-in screen from the first frame', async ({ page }) => {
  expect(await displayWhenParsed(page, false)).toBe('flex');
  await expect(page.locator('#sakura-landing-overlay')).toBeVisible();
  await page.click('#sakura-landing-continue-btn');
  await expect(page.locator('#sakura-landing-overlay')).toBeHidden();
});

test('a browser that signed in before does not show it while the session restores', async ({ page }) => {
  expect(await displayWhenParsed(page, true)).toBe('none');
});
