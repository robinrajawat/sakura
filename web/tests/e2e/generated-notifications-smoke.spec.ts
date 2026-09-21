import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign in this
// file:// test harness (ServiceWorker rejected on the 'null' origin; cdnjs/jsdelivr CORS
// failures for optional export libraries not used by this test).
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

test.describe('generated notifications block (src/state/notifications.ts spliced into index.html)', () => {
  test('local notification lifecycle: push, badge, open menu, read, dismiss', async ({ page }) => {
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

    // 1. Confirm the key exported functions exist on the page.
    const fnTypes = await page.evaluate(() => ({
      // @ts-expect-error — global app state from index.html, not a module export
      push: typeof pushLocalNotification,
      // @ts-expect-error
      toggle: typeof toggleNotifMenu,
      // @ts-expect-error
      combined: typeof combinedNotifItems,
      // @ts-expect-error
      renderList: typeof renderNotifList,
    }));
    expect(fnTypes).toEqual({ push: 'function', toggle: 'function', combined: 'function', renderList: 'function' });

    // 2. Push a local (device-only, no sign-in required) notification and confirm the badge
    // reflects it — exercises pushLocalNotification -> renderNotifBell against the REAL
    // #notif-badge element in the page, not a stub.
    const badgeAfterPush = await page.evaluate(() => {
      // @ts-expect-error
      pushLocalNotification('backup_reminder', 'Test reminder from e2e smoke test');
      const badge = document.getElementById('notif-badge');
      return { text: badge?.textContent, display: badge?.style.display };
    });
    expect(badgeAfterPush).toEqual({ text: '1', display: 'flex' });

    // 3. Open the menu via the real #notif-toggle button (exercises the footer-wired click
    // handler, not a direct function call) and confirm the real #notif-list DOM was built by
    // the hand-written renderNotifList() calling back into the generated block's exports.
    await page.click('#notif-toggle');
    const listText = await page.locator('#notif-list').innerText();
    expect(listText).toContain('Test reminder from e2e smoke test');
    const menuOpen = await page.evaluate(() => document.getElementById('notif-menu')?.classList.contains('open'));
    expect(menuOpen).toBe(true);

    // 4. Click the notification item to mark it read, then dismiss it, and confirm the badge
    // clears — exercises markNotificationRead/deleteNotification wired to the real DOM.
    await page.click('.notif-item');
    const badgeAfterRead = await page.evaluate(() => document.getElementById('notif-badge')?.style.display);
    expect(badgeAfterRead).toBe('none');

    await page.click('.notif-item-dismiss');
    const remaining = await page.evaluate(() => {
      // @ts-expect-error
      return combinedNotifItems().length;
    });
    expect(remaining).toBe(0);
    const emptyStateText = await page.locator('#notif-list').innerText();
    expect(emptyStateText).toContain("You're all caught up");

    // 5. Clicking outside the notif wrap closes the menu (footer-wired outside-click handler
    // reading isNotifMenuOpen()).
    await page.click('body', { position: { x: 10, y: 10 } });
    const menuOpenAfterOutsideClick = await page.evaluate(() =>
      document.getElementById('notif-menu')?.classList.contains('open')
    );
    expect(menuOpenAfterOutsideClick).toBe(false);

    // 6. Zero unexpected page/console errors.
    expect(unexpectedErrors).toEqual([]);
  });
});
