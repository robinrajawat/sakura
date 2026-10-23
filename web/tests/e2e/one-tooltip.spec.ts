import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// One tooltip style (owner, 2026-10-23: unified UI): hints use the app's themed tooltip (data-tip),
// never the browser's plain title tooltip. Document/iframe titles aren't tooltips and stay.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('index.html sets no hover hint through the title attribute (except a disabled menu item\'s reason)', () => {
  const src = fs.readFileSync(indexPath, 'utf8');
  const hits = src.split('\n').filter((l) => /\btitle="|\.title=/.test(l) && !/document\.title|tab\.title|\bd\.title|iframe\.title|<title|it\.disabled/.test(l));
  expect(hits).toEqual([]);
});

test('a menu item\'s hint shows in the app tooltip', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof showSbContextMenu === "function"');
  await page.evaluate(() => (window as any).eval(`showSbContextMenu(200, 200, [{ label: 'Group rows', title: 'Show each repeated value once', onClick: () => {} }])`));
  await page.locator('.sb-context-item', { hasText: 'Group rows' }).hover();
  await expect(page.locator('#node-timestamp-tip')).toHaveText('Show each repeated value once');
});
