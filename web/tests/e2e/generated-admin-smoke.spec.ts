import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

test.describe('generated admin block (src/state/admin.ts spliced into index.html)', () => {
  test('refreshAdminStatus toggles the real admin settings section via the hardcoded-email fast path', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + indexPath);

    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => {
        const el = document.getElementById('sakura-landing-overlay');
        if (el) el.style.display = 'none';
      });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    // 1. Confirm the exported functions exist, and isAdmin remains a bare (unexported)
    // top-level boolean — the specific compatibility property this module's design relies on.
    const fnTypes = await page.evaluate(() => ({
      // @ts-expect-error — global app state from index.html, not a module export
      refresh: typeof refreshAdminStatus,
      // @ts-expect-error
      isFeedbackAdminFn: typeof isFeedbackAdmin,
      // @ts-expect-error
      isAdminBare: typeof isAdmin,
    }));
    expect(fnTypes).toEqual({ refresh: 'function', isFeedbackAdminFn: 'function', isAdminBare: 'boolean' });

    // 2. The admin settings section starts hidden (no signed-in user yet).
    const initiallyHidden = await page.evaluate(
      () => document.getElementById('settings-section-account-admin')?.style.display
    );
    expect(initiallyHidden).toBe('none');

    // 3. Calling refreshAdminStatus with the hardcoded admin email grants access synchronously
    // (the fast path — no Firestore round-trip needed to see this take effect), against the
    // REAL DOM element, not a stub.
    const afterAdminLogin = await page.evaluate(() => {
      // @ts-expect-error
      refreshAdminStatus({ uid: 'test-uid', email: 'robinsinghrajawat@gmail.com' });
      const sec = document.getElementById('settings-section-account-admin');
      // @ts-expect-error — bare identifier: isAdmin is a top-level `let`, not on window/globalThis
      return { display: sec?.style.display, featureHidden: sec?.dataset.featureHidden, isAdmin };
    });
    expect(afterAdminLogin).toEqual({ display: '', featureHidden: '', isAdmin: true });

    // 4. Calling it again with a non-matching user hides the section again (no Firestore admins
    // doc for this made-up uid, so the async check resolves false and never flips it back true).
    const afterNonAdminLogin = await page.evaluate(async () => {
      // @ts-expect-error
      refreshAdminStatus({ uid: 'random-non-admin-uid', email: 'nobody@example.com' });
      await new Promise((r) => setTimeout(r, 300)); // let the async Firestore check settle
      const sec = document.getElementById('settings-section-account-admin');
      // @ts-expect-error — bare identifier, see above
      return { display: sec?.style.display, isAdmin };
    });
    expect(afterNonAdminLogin.display).toBe('none');
    expect(afterNonAdminLogin.isAdmin).toBe(false);

    // 5. Zero unexpected page/console errors.
    expect(unexpectedErrors).toEqual([]);
  });
});
