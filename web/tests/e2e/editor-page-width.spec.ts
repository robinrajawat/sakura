import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner (2026-10-28): the editor is a centred 900px page (title, rows, notes, threads), growing with
// Text size; Settings → Editor → Full width lets it run the whole window.

async function open(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
}
const widths = (page: Page) => page.evaluate(() => ['editor-pane-inner', 'editor-title-inner'].map((id) => Math.round(document.getElementById(id)!.getBoundingClientRect().width)));

test('the editor is a 900px page by default, wider with the text size', async ({ page }) => {
  await open(page);
  expect(await widths(page)).toEqual([900, 900]);
  await page.evaluate('setEditorScale(1.2, false)');
  expect(await widths(page)).toEqual([1080, 1080]);
});

test('Full width runs the whole window, and is remembered', async ({ page }) => {
  await open(page);
  await page.evaluate('document.getElementById("editor-full-width-toggle").click()');
  const [inner] = await widths(page);
  expect(inner).toBeGreaterThan(1100);
  await expect(page.locator('#editor-full-width-toggle')).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate('editorFullWidth = false; loadPrefs(); editorFullWidth')).toBe(true);
});
