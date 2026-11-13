import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, ground rule 1: the desktop is never in the phone layout, and a desktop
// window narrowed below 768px switches to it (and back) without a reload.
test('desktop widths are never the phone layout; narrowing the window switches it', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('file://' + indexPath);
  const html = page.locator('html');
  // @ts-expect-error -- bare global from index.html
  const phone = () => page.evaluate(() => isPhoneLayout() as boolean);
  for (const width of [1280, 1024, 800, 768]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await phone(), `at ${width}px`).toBe(false);
    await expect(html).not.toHaveClass(/(^|\s)phone(\s|$)/);
  }
  await page.setViewportSize({ width: 767, height: 800 });
  await expect(html).toHaveClass(/(^|\s)phone(\s|$)/);
  expect(await phone()).toBe(true);
  // Narrowing never redirects mid-session.
  expect(page.url()).toContain('index.html');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(html).not.toHaveClass(/(^|\s)phone(\s|$)/);
});
