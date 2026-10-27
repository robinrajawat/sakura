import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

test.use({ colorScheme: 'dark' });

// In dark mode the Hub's account menu, quick-add bar and sheets sit one step lighter than the
// page (--surface-raised, as in index.html) instead of a shade darker, where they sank into it.
test('Hub dark mode: menus, quick-add bar and sheets are raised above the page', async ({ page }) => {
  await page.goto('file://' + hubPath);
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  const bg = await page.evaluate(() => {
    const of = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor : null);
    return {
      page: of(document.body),
      menu: of(document.getElementById('account-dropdown')),
      quickAdd: of(document.getElementById('todo-quickadd-bar')),
      sheet: of(document.querySelector('.hub-modal')),
    };
  });
  expect(bg.page).toBe('rgb(18, 18, 18)');
  expect(bg.menu).toBe('rgb(28, 28, 26)');
  expect(bg.quickAdd).toBe('rgb(28, 28, 26)');
  expect(bg.sheet).toBe('rgb(28, 28, 26)');
});
