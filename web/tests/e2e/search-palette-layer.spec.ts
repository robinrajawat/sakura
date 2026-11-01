import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Search (Ctrl/Cmd+/) sits below the document title, its results have the box's width, and the page
// behind dims (owner 2026-11-01: the box floated over the title). A click on the page still closes it.
test('Search opens below the title as one layer over a dimmed page', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
  await page.keyboard.press('ControlOrMeta+/');
  const box = page.locator('#global-search-wrap.qa-open .qa-input-row');
  await expect(box).toBeVisible();
  const titleBottom = await page.locator('#editor-title-inner').evaluate(e => e.getBoundingClientRect().bottom);
  const boxTop = await box.evaluate(e => e.getBoundingClientRect().top);
  expect(boxTop).toBeGreaterThanOrEqual(titleBottom - 1);
  const dim = await page.evaluate(() => getComputedStyle(document.body, '::after').backgroundColor);
  expect(dim).not.toBe('rgba(0, 0, 0, 0)');
  await page.mouse.click(900, 700);
  await expect(page.locator('#global-search-wrap.qa-open')).toHaveCount(0);
  const after = await page.evaluate(() => getComputedStyle(document.body, '::after').content);
  expect(after === 'none' || after === 'normal').toBe(true);
});
