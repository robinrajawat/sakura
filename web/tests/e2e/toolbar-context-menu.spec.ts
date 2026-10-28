import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('right-click on empty toolbar space opens the app menu', async ({ page }) => {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => { const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none'; });
  // Find a point on the toolbar that is not a button.
  const pt = await page.evaluate(() => {
    const bar = document.getElementById('quick-bar')!;
    const r = bar.getBoundingClientRect();
    for (let x = r.left + 2; x < r.right; x += 4) {
      const y = r.top + r.height / 2;
      const t = document.elementFromPoint(x, y);
      if (t && bar.contains(t) && !t.closest('button,input')) return { x, y };
    }
    return null;
  });
  expect(pt).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y, { button: 'right' });
  const menu = page.locator('.sb-context-menu').last();
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('New document');
  await expect(menu).toContainText('Settings');
});
