import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-21: verified from the email, but the installed iPhone app kept showing "Verify your
// email": it only checked at sign-in. Coming back to the app (or opening Settings) checks again.
test('"Verify your email" goes away once the address is verified elsewhere and the app comes back', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => (window as unknown as { __sakuraMainDone?: boolean }).__sakuraMainDone === true);
  await page.evaluate(`
    window.__verifiedOnServer = false;
    currentUser = { uid: 'u1', email: 'a@example.com', emailVerified: false, providerData: [{ providerId: 'password' }],
      reload() { this.emailVerified = window.__verifiedOnServer; return Promise.resolve(); },
      getIdToken() { return Promise.resolve('t'); } };
    updateVerifyEmailRow(currentUser);
  `);
  const row = page.locator('#settings-verify-email-row');
  await expect(row).not.toHaveCSS('display', 'none');
  // Back to the app before verifying: still asks.
  await page.evaluate(`window.dispatchEvent(new Event('focus'))`);
  await expect(row).not.toHaveCSS('display', 'none');
  // The link is opened in Mail; back to the app: the row goes.
  await page.evaluate(`window.__verifiedOnServer = true; window.dispatchEvent(new Event('focus'))`);
  await expect(row).toHaveCSS('display', 'none');
});
