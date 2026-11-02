import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A thread's reply line never says a bare "Who?" (2026-11-02 audit): it writes as whoever wrote last,
// else the document's author, else Your name, else the account's name; with none it says "Add name".
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.getByText('Add first row').click();
  await page.keyboard.type('Budget');
});

test('no name anywhere: the reply line says Add name', async ({ page }) => {
  await page.keyboard.press('Control+Alt+m');
  await expect(page.locator('.thread-author-btn')).toHaveText('Add name ▾');
});

test('Your name fills in when nobody has written yet', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { setDefaultAuthorName('Robin', false); const a = el('doc-author'); if (a) a.value = ''; });
  await page.keyboard.press('Control+Alt+m');
  await expect(page.locator('.thread-author-btn')).toHaveText('Robin ▾');
});
