import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Bug (owner 2026-11-02): a reload flashed an empty "Untitled" page before the open document
// appeared, because the static page painted while the big script was still loading. The document and
// File Explorer stay invisible (html.presetup-doc-pending) until the startup render.
test('the document area is hidden until the startup render, then shown', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.route('**/*', route => route.continue());
  await page.goto('file://' + indexPath, { waitUntil: 'commit' });
  await page.waitForLoadState('load');
  await expect(page.locator('html')).not.toHaveClass(/presetup-doc-pending/);
  await expect(page.locator('#editor-wrap')).toBeVisible();
  // The pre-setup script adds the class before first paint.
  const src = await page.evaluate(() => [...document.scripts].map(s => s.textContent || '').find(t => t.includes("cls.push('presetup-doc-pending')")) ? 'yes' : 'no');
  expect(src).toBe('yes');
});
