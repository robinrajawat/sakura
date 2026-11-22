import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-22: "Verify your email" flashed up after signing in and went again, on a phone,
// for an address verified the day before. A session restored on a device carries the state from
// when it signed in; the row now shows only once the account server has just said "not verified",
// and Settings → About → Details says what the server said, for diagnosing.

type W = {
  updateVerifyEmailRow: (u: unknown) => void;
  noteEmailVerifiedCheck: (u: unknown, e: unknown, source?: string) => void;
  recheckEmailVerified: () => void;
  currentUser: unknown;
  storageDiagnosticsText: () => Promise<string>;
};

const shown = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.getElementById('settings-verify-email-row')!.style.display !== 'none');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await page.evaluate(() => {
    (window as unknown as { __u: unknown }).__u = { uid: 'u1', email: 'sam@example.com', emailVerified: false, providerData: [{ providerId: 'password' }], reload: async () => {}, getIdToken: async () => 't' };
  });
});

test('not shown from the session alone, before the account server has answered', async ({ page }) => {
  await page.evaluate(() => (window as unknown as W).updateVerifyEmailRow((window as unknown as { __u: unknown }).__u));
  expect(await shown(page)).toBe(false);
});

test('shown once the account server says not verified; hidden when a check failed', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as W & { __u: unknown };
    w.noteEmailVerifiedCheck(w.__u, null);
    w.updateVerifyEmailRow(w.__u);
  });
  expect(await shown(page)).toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as W & { __u: unknown };
    w.noteEmailVerifiedCheck(w.__u, { code: 'auth/network-request-failed' });
    w.updateVerifyEmailRow(w.__u);
  });
  expect(await shown(page)).toBe(false);
});

test('a check that failed is tried again, and a verified address hides the row', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as W & { __u: { emailVerified: boolean; reload: () => Promise<void> } };
    w.__u.reload = async () => { w.__u.emailVerified = true; };
    w.noteEmailVerifiedCheck(w.__u, { code: 'auth/network-request-failed' });
    (window as unknown as { eval: (s: string) => unknown }).eval('currentUser = window.__u');
    w.recheckEmailVerified();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __u: { emailVerified: boolean } }).__u.emailVerified)).toBe(true);
  expect(await shown(page)).toBe(false);
});

test('Details says how the account signs in and what the server said about the email', async ({ page }) => {
  const text = await page.evaluate(async () => {
    const w = window as unknown as W & { __u: unknown };
    (window as unknown as { eval: (s: string) => unknown }).eval('currentUser = window.__u');
    w.noteEmailVerifiedCheck(w.__u, null);
    return w.storageDiagnosticsText();
  });
  expect(text).toContain('Account: sam@example.com · signed in with email and password');
  expect(text).toMatch(/Email verified: no \(checked with the account server at /);
});
