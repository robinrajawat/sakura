import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// One toast for the whole app (owner, 2026-10-23: unified UI): To-Dos messages and their Undo use
// the same toast as the editor, and the docked panel stays open when you click Undo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('deleting a task shows the app toast with Undo; Undo brings it back and the panel stays open', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 'a', text: 'Call the vendor', createdAt: Date.now(), done: false, subtasks: [] }]));
  });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => { const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none'; });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
  await expect(page.locator('#todos-toast')).toHaveCount(0);
  await page.locator('.todo-row[data-id="a"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: /^\s*Delete\s*$/ }).click();
  await expect(page.locator('#toast')).toContainText('Task deleted');
  await page.locator('#toast button', { hasText: 'Undo' }).click();
  await expect(page.locator('.todo-text[data-id="a"]')).toBeVisible();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
});
