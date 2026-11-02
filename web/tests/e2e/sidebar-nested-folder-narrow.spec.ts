import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Bug (owner 2026-11-02): dragging the File Explorer narrow left nested folder rows at their full
// width, so long names were cut at the edge and the counts disappeared. The nested list is a grid
// whose column now shrinks with the panel (minmax(0,1fr)), so names end in "…" like top-level rows.
test('nested folder rows shrink with a narrow File Explorer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_sidebar_width_v1', '180');
    localStorage.setItem('sakura_folders_v1', JSON.stringify([
      { id: 'f1', name: 'Projects', open: true, parentId: null },
      { id: 'f2', name: 'Flexible Night Delivery with a long name', open: true, parentId: 'f1' },
    ]));
  });
  await page.goto('file://' + indexPath);
  const nested = page.locator('.sfolder-row[data-folder-id="f2"]');
  await expect(nested).toBeVisible();
  const { row, sidebar } = await page.evaluate(() => ({
    row: document.querySelector('.sfolder-row[data-folder-id="f2"]')!.getBoundingClientRect().right,
    sidebar: document.getElementById('sidebar')!.getBoundingClientRect().right,
  }));
  expect(row).toBeLessThanOrEqual(sidebar);
  await expect(nested.locator('.sfolder-count')).toBeInViewport();
});
