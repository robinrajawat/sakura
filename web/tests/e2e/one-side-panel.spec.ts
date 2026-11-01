import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
});

// To-Dos, Settings and Help share the slot beside the rail: one at a time. With To-Dos and Settings
// both open the page slid under Settings and was cut off, and two rail icons were lit.
test('opening Settings or Help closes To-Dos, and opening To-Dos closes them', async ({ page }) => {
  const open = (id: string) => page.evaluate((i) => document.getElementById(i)!.classList.contains('open'), id);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => toggleTodosPanel());
  expect(await open('todos-panel')).toBe(true);
  await page.click('#rail-settings-btn');
  expect(await open('settings-panel')).toBe(true);
  expect(await open('todos-panel')).toBe(false);
  await expect(page.locator('#todos-toggle.is-active')).toHaveCount(0);
  // The page sits fully to the right of Settings, not under it.
  const pageLeft = await page.locator('#editor-pane-inner').evaluate(e => e.getBoundingClientRect().left);
  const sheetRight = await page.locator('#settings-panel').evaluate(e => e.getBoundingClientRect().right);
  expect(pageLeft).toBeGreaterThanOrEqual(sheetRight - 1);

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => toggleTodosPanel());
  expect(await open('todos-panel')).toBe(true);
  expect(await open('settings-panel')).toBe(false);

  await page.evaluate(() => document.getElementById('help-panel')!.classList.add('open'));
  expect(await open('todos-panel')).toBe(false);
});
