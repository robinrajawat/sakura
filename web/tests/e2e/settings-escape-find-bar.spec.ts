import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
});

// Escape closes Settings like every other panel; Escape in Settings' own search box closes only the search.
test('Escape closes Settings', async ({ page }) => {
  const isOpen = () => page.evaluate(() => document.getElementById('settings-panel')!.classList.contains('open'));
  await page.click('#rail-settings-btn');
  expect(await isOpen()).toBe(true);
  await page.keyboard.press('Escape');
  expect(await isOpen()).toBe(false);

  await page.click('#rail-settings-btn');
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => toggleSettingsSearch());
  await expect(page.locator('#settings-search')).toBeFocused();
  await page.keyboard.press('Escape');
  expect(await isOpen()).toBe(true);
  await page.keyboard.press('Escape');
  expect(await isOpen()).toBe(false);
});

// Ctrl/Cmd+F is a plain "Find in document" box until you type; the count, arrows and match options appear with a query.
test('find bar shows only the box and close until you type', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openSearch());
  await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Find in document…');
  for (const id of ['#search-count', '#search-prev', '#search-next', '#search-match-case', '#search-whole-word', '#search-toggle-replace']) {
    await expect(page.locator(id)).toBeHidden();
  }
  await page.keyboard.type('a');
  for (const id of ['#search-count', '#search-prev', '#search-next', '#search-match-case', '#search-whole-word']) {
    await expect(page.locator(id)).toBeVisible();
  }
  await expect(page.locator('#search-toggle-replace')).toBeHidden();
});

// On wide windows Settings takes the File Explorer's place and moves the page over (like To-Dos), and
// working in the page keeps it open; on narrow windows it's a sheet and the page behind fades back.
test('Settings sits beside the page on wide windows, over a faded page on narrow ones', async ({ page }) => {
  const state = () => page.evaluate(() => ({
    open: document.getElementById('settings-panel')!.classList.contains('open'),
    margin: getComputedStyle(document.getElementById('app-layout')!).marginLeft,
    opacity: getComputedStyle(document.getElementById('editor-pane-inner')!).opacity,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#rail-settings-btn');
  await expect.poll(async () => (await state()).margin).toBe('760px');
  expect((await state()).opacity).toBe('1');
  await page.mouse.click(1100, 500); // in the page
  expect((await state()).open).toBe(true);
  await page.click('#rail-settings-btn');
  expect((await state()).open).toBe(false);

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.click('#rail-settings-btn');
  await expect.poll(async () => (await state()).opacity).toBe('0.3');
  expect((await state()).margin).toBe('0px');
  await page.mouse.click(1100, 500); // outside the sheet closes it
  expect((await state()).open).toBe(false);
});
