import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Anchored popovers close one way (src/ui/popoverDismiss.ts, owner 2026-10-24 "standard, unified and
// elegant"): Escape closes, a press outside closes. (Escape also returns focus to the opener; today's
// openers are spans or hidden buttons that can't take focus, so that part is covered by the unit test.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 'a', text: 'Send the proofs', createdAt: 1760000000000, done: false, subtasks: [], due: '2026-10-28' }]));
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
});

async function seedThread(page: Page) {
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Rollout'), n(2, 1, 'Cutover')]; rebuildParentIds(); nextId = 3;
    remarks = [{ id: 'c1', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'Weekend works for ops.', createdAt: new Date(2026, 9, 14, 10, 0).getTime() }];
    inlineExpandRemarksNodeIds = new Set([2]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
}

test('Escape closes the thread entry date picker (it used to ignore Escape)', async ({ page }) => {
  await seedThread(page);
  await page.locator('.thread-entry:has(#inline-remark-text-c1) .thread-time').click();
  const pop = page.locator('#remarks-date-popover');
  await expect(pop).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(pop).not.toHaveClass(/open/);
});

test('a press outside closes the thread entry date picker', async ({ page }) => {
  await seedThread(page);
  await page.locator('.thread-entry:has(#inline-remark-text-c1) .thread-time').click();
  await expect(page.locator('#remarks-date-popover')).toHaveClass(/open/);
  await page.mouse.click(700, 850);
  await expect(page.locator('#remarks-date-popover')).not.toHaveClass(/open/);
});

test('Escape closes the To-Do due date picker', async ({ page }) => {
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.remove());
  await page.keyboard.press('Control+Shift+T');
  await page.locator('.todo-row[data-id="a"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Due date' }).click();
  const pop = page.locator('#todo-due-popover');
  await expect(pop).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(pop).not.toHaveClass(/open/);
});
