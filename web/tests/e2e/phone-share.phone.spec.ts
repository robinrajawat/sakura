import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Send a copy on a phone (owner 2026-11-19): the box spans the screen under the top line, like
// search, instead of hanging off the Share button at its desktop width and running off the left
// edge. Not at the bottom: the keyboard would cover it on an iPhone.
test('Send a copy fits the phone screen, under the top line, with touch-size controls', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { openShareDropdown?: unknown }).openShareDropdown === 'function');
  const r = await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'a', email: 'alice@example.com' };
    // @ts-expect-error -- bare globals from index.html
    openShareDropdown(currentDocId || 'd1', 'A document with a fairly long title that would not fit');
    const box = document.getElementById('share-dd-menu')!.getBoundingClientRect();
    const send = document.getElementById('share-modal-send-btn')!.getBoundingClientRect();
    return {
      phone: document.documentElement.classList.contains('phone'),
      left: box.left, right: box.right, top: box.top, vw: window.innerWidth,
      sendHeight: send.height,
      inputFont: parseFloat(getComputedStyle(document.getElementById('share-modal-email-input')!).fontSize)
    };
  });
  expect(r.phone).toBe(true);
  expect(r.left).toBeGreaterThanOrEqual(8);
  expect(r.right).toBeLessThanOrEqual(r.vw - 8);
  expect(r.top).toBeLessThan(120);
  expect(r.sendHeight).toBeGreaterThanOrEqual(44);
  expect(r.inputFont).toBeGreaterThanOrEqual(16);
});
