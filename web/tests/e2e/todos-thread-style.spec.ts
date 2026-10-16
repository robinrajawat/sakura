import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

async function openWith(page: import('@playwright/test').Page, todos: object[]) {
  const full = todos.map((t) => ({ createdAt: Date.now(), done: false, status: 'none', priority: 'none', subtasks: [], ...t }));
  await page.addInitScript((t) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
  }, full);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}

test('status is the shape of the circle at rest, and a chip again once expanded', async ({ page }) => {
  await openWith(page, [
    { id: 'w', text: 'Waiting task', status: 'waiting' },
    { id: 'b', text: 'Blocked task', status: 'blocked' },
    { id: 'p', text: 'In progress task', status: 'progress' },
  ]);
  const check = (id: string) => page.locator(`.todo-check[data-id="${id}"]`);
  expect(await check('w').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  expect(await check('p').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('""');
  expect(await check('b').evaluate((el) => getComputedStyle(el, '::before').content)).toBe('""');
  await expect(check('p')).toHaveAttribute('data-tip', 'In Progress');
  await expect(page.locator('.todo-status[data-id="p"]')).toBeHidden();
  await page.click('.todo-expand-toggle[data-id="p"]', { force: true });
  await expect(page.locator('.todo-status[data-id="p"]')).toBeVisible();
});

test('the due date sits in the right column at rest and returns to the chip line when expanded', async ({ page }) => {
  await openWith(page, [{ id: 'd', text: 'Task with a due date', dueDate: iso(-3), priority: 'high' }]);
  const due = page.locator('.todo-due[data-id="d"]');
  const row = page.locator('.todo-row[data-id="d"]');
  const rest = await due.evaluate((el) => ({ pos: getComputedStyle(el).position, right: el.getBoundingClientRect().right }));
  const rowRight = await row.evaluate((el) => el.getBoundingClientRect().right);
  expect(rest.pos).toBe('absolute');
  expect(rowRight - rest.right).toBeLessThan(16);
  await expect(due).toHaveClass(/overdue/);
  await page.click('.todo-expand-toggle[data-id="d"]', { force: true });
  expect(await due.evaluate((el) => getComputedStyle(el).position)).toBe('static');
});

test('priority, repeat and subtask progress share one chip shape; only High and Medium are coloured', async ({ page }) => {
  await openWith(page, [
    { id: 'h', text: 'High', priority: 'high' },
    { id: 'l', text: 'Low', priority: 'low', repeat: 'weekly', dueDate: iso(2) },
  ]);
  const chip = (sel: string) => page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { radius: cs.borderTopLeftRadius, height: cs.height, color: cs.color, bg: cs.backgroundColor };
  });
  const high = await chip('.todo-priority[data-id="h"]');
  const low = await chip('.todo-priority[data-id="l"]');
  const repeat = await chip('.todo-repeat[data-id="l"]');
  expect(high.radius).toBe(low.radius);
  expect(low.height).toBe(repeat.height);
  expect(low.color).toBe(repeat.color); // Low is as quiet as a repeat chip
  expect(high.color).not.toBe(low.color);
  // Repeat shows once: no second repeat icon on the date at rest.
  await expect(page.locator('.todo-due[data-id="l"] .todo-due-repeat-icon')).toBeHidden();
});
