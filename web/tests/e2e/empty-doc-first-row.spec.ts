import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

test("an empty document's button adds its first row instead of another document", async ({ page }) => {
  const docCount = () => page.locator('.sdoc-item').count();
  const before = await docCount();
  await page.click('#es-first-row-btn');
  await page.keyboard.type('First idea', { delay: 30 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor-pane-inner')).toContainText('First idea');
  await expect(page.locator('#es-first-row-btn')).toHaveCount(0);
  expect(await docCount()).toBe(before);
});
