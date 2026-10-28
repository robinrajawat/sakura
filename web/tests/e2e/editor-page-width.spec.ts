import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner (2026-10-28): the editor runs the full width of the window (as before the short-lived 900px
// page), with no width setting.

async function open(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
}

test('the title and the rows run the full width, at any text size; there is no width setting', async ({ page }) => {
  await open(page);
  const widths = () => page.evaluate(() => ['editor-pane-inner', 'editor-title-inner'].map((id) => Math.round(document.getElementById(id)!.getBoundingClientRect().width)));
  for (const w of await widths()) expect(w).toBeGreaterThan(1100);
  await page.evaluate('setEditorScale(1.2, false)');
  for (const w of await widths()) expect(w).toBeGreaterThan(1100);
  await expect(page.locator('#editor-full-width-toggle')).toHaveCount(0);
  expect(await page.evaluate('typeof setEditorFullWidth')).toBe('undefined');
});
