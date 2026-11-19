import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-19: on an iPhone the first tap on "Sign in with Google" did nothing; the second
// worked. Safari lets a page open a window only during the tap, and the first tap first downloaded
// the sign-in code. As sign-in pages do, the code now loads while a sign-in button is on screen,
// and the tap opens Google's window straight away. Firebase is stood in for (no network here).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { signInWithGoogleAccount?: unknown }).signInWithGoogleAccount === 'function');
});

test('the sign-in code starts loading when the landing page shows, not on the tap', async ({ page }) => {
  const calls = await page.evaluate(() => {
    let n = 0;
    // @ts-expect-error -- bare globals from index.html
    loadFirebaseMods = () => { n++; return new Promise(() => {}); }; _firebaseMods = null;
    // @ts-expect-error -- bare globals from index.html
    showLandingOverlay();
    return n;
  });
  expect(calls).toBe(1);
});

test('once loaded, the tap itself opens Google\'s window (nothing is awaited first)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const w = window as unknown as { __inTap: boolean; __calledInTap: boolean | null };
    w.__inTap = false; w.__calledInTap = null;
    const authMod = { GoogleAuthProvider: function () {}, signInWithPopup: () => { w.__calledInTap = w.__inTap; return new Promise(() => {}); } };
    // @ts-expect-error -- bare globals from index.html
    _firebaseMods = { app: {}, auth: {}, authMod };
    const btn = document.getElementById('sakura-landing-google-signin-btn')!;
    // "In the tap" = from the first click listener until the click has finished going through the page.
    document.addEventListener('click', () => { w.__inTap = true; }, true);
    window.addEventListener('click', () => { w.__inTap = false; });
    btn.click();
    return w.__calledInTap;
  });
  expect(r).toBe(true);
});

test('a window the browser still blocks says what to do instead of nothing', async ({ page }) => {
  await page.evaluate(() => {
    const authMod = { GoogleAuthProvider: function () {}, signInWithPopup: () => Promise.reject(Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' })) };
    // @ts-expect-error -- bare globals from index.html
    _firebaseMods = { app: {}, auth: {}, authMod };
    // @ts-expect-error -- bare globals from index.html
    signInWithGoogleAccount();
  });
  await expect(page.locator('#toast')).toContainText('Your browser blocked the Google sign-in window. Tap “Sign in with Google” again.');
});
