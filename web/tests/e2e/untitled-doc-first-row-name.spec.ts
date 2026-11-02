import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// 2026-11-02 audit: two new documents were both "Untitled" in the File Explorer, Search and Recent.
// A document with no title is now listed by its first row's words; its title field stays empty.
test('an untitled document is listed by its first row; a real title wins', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.getByText('Add first row').click();
  await page.keyboard.type('Kickoff agenda');
  await page.keyboard.press('Escape');
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { saveToStorage(); renderSidebar(); });
  await expect(page.locator('#sidebar .sdoc-item').filter({ hasText: 'Kickoff agenda' })).toHaveCount(1);
  await expect(page.locator('#header-title')).toHaveValue('');
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { el('header-title').value = 'Q1 kickoff'; el('header-title').dispatchEvent(new Event('input')); saveToStorage(); renderSidebar(); });
  await expect(page.locator('#sidebar .sdoc-item').filter({ hasText: 'Q1 kickoff' })).toHaveCount(1);
  await expect(page.locator('#sidebar .sdoc-item').filter({ hasText: 'Kickoff agenda' })).toHaveCount(0);
});
