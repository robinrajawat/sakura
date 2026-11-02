import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Settings → About shows "Version <build date> · <commit>", stamped by the build (vite.config.js).
// An unbuilt copy still has the placeholder and shows no version line (2026-11-02).
test('an unbuilt copy shows no version line; the build stamps one', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#about-version')).toHaveAttribute('data-version', '__SAKURA_VERSION__');
  await expect(page.locator('#about-version')).toBeHidden();
});
