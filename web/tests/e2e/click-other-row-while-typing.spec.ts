import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Bug (2026-11-02 audit): while typing in a row, a click on another row was lost. The blur re-rendered
// the outline between mouse-down and mouse-up, so the browser dropped the click and typing kept going
// into the old row.
test('clicking another row while typing moves the caret there', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.getByText('Add first row').click();
  await page.keyboard.type('First row');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second row');
  const labels = () => page.evaluate(() => [...document.querySelectorAll('.node-label,.node-input')].map(e => e.textContent));

  // On the other row's words.
  await page.getByText('First row', { exact: true }).click({ position: { x: 5, y: 8 } });
  await page.keyboard.type('A');
  let now = await labels();
  expect(now[0]).toContain('A');
  expect(now[0]).not.toBe('First row');
  expect(now[1]).toBe('Second row');

  // On the blank space to the right of the other row's words: caret at its end.
  const second = await page.getByText('Second row', { exact: true }).boundingBox();
  await page.mouse.click(second!.x + second!.width - 4, second!.y + second!.height / 2);
  await page.keyboard.type('B');
  now = await labels();
  expect(now[0]).toBe(now[0].replace('B', ''));
  expect(now[1]).toBe('Second rowB');
});
