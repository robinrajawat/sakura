import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-10-28: Help changed size with each rail; Quick Assist's coloured "GO TO"/"RUN"
// badges and accent bar were noise. Panels keep one size; results are plain words.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

test('Help keeps one height whichever rail is picked', async ({ page }) => {
  await page.evaluate(() => document.getElementById('help-toggle')?.click());
  const rails = page.locator('#help-panel .settings-rail-btn');
  await expect(rails.first()).toBeVisible();
  const heights = new Set<number>();
  for (let i = 0; i < await rails.count(); i++) {
    await rails.nth(i).click();
    heights.add(await page.locator('#help-panel').evaluate((e) => Math.round(e.getBoundingClientRect().height)));
  }
  expect(heights.size).toBe(1);
});

test('Quick Assist results are plain words: no verb badges, no accent bar', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setQaOpen(true);
  });
  await page.locator('#qa-input').fill('hide');
  const first = page.locator('#qa-results .qa-item').first();
  await expect(first).toBeVisible();
  await expect(page.locator('#qa-results .qa-item-verb')).toHaveCount(0);
  await expect(page.locator('#qa-results .qa-item-label', { hasText: /^Hide File Explorer$/ })).toHaveCount(1);
  await expect(page.locator('#qa-results .qa-item-label', { hasText: /^Turn off Spellcheck$/ })).toHaveCount(1);
  const bar = await first.evaluate((b) => getComputedStyle(b, '::before').content);
  expect(bar).toBe('none');
});
