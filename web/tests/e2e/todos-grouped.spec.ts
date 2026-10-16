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

const idsIn = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(`${sel} .todo-row`).evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id')));

test('open tasks are grouped: a Now card, then Doing, Up next and On hold', async ({ page }) => {
  await openWith(page, [
    { id: 'a', text: 'In progress, later', status: 'progress', dueDate: iso(5) },
    { id: 'b', text: 'In progress, overdue', status: 'progress', dueDate: iso(-2), priority: 'low' },
    { id: 'c', text: 'Not started' },
    { id: 'd', text: 'Waiting on someone', status: 'waiting' },
    { id: 'e', text: 'Blocked', status: 'blocked' },
    { id: 'f', text: 'In review', status: 'review' },
  ]);
  // Now = the overdue in-progress task, shown once (not repeated under Doing).
  expect(await idsIn(page, '.todos-now')).toEqual(['b']);
  expect(await idsIn(page, '.todos-group-doing')).toEqual(['a']);
  expect(await idsIn(page, '.todos-group-next')).toEqual(['c']);
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['d', 'e', 'f']);
  await expect(page.locator('.todos-group-doing .todos-group-label')).toContainText('Doing');
  await expect(page.locator('.todos-group-hold .todos-group-label')).toContainText('On hold');
});

test('Now prefers the higher priority among in-progress tasks', async ({ page }) => {
  await openWith(page, [
    { id: 'low', text: 'Low', status: 'progress', priority: 'low' },
    { id: 'high', text: 'High', status: 'progress', priority: 'high' },
  ]);
  expect(await idsIn(page, '.todos-now')).toEqual(['high']);
  expect(await idsIn(page, '.todos-group-doing')).toEqual(['low']);
});

test('no in-progress task means no Now card, and empty groups are not shown', async ({ page }) => {
  await openWith(page, [{ id: 'x', text: 'Plain' }]);
  await expect(page.locator('.todo-row[data-id="x"]')).toBeVisible();
  await expect(page.locator('.todos-now')).toHaveCount(0);
  await expect(page.locator('.todos-group-doing')).toHaveCount(0);
  await expect(page.locator('.todos-group-hold')).toHaveCount(0);
});

test('status shows as a chip only under On hold; the heading says it elsewhere', async ({ page }) => {
  await openWith(page, [
    { id: 'p', text: 'Doing', status: 'progress' },
    { id: 'q', text: 'Doing too', status: 'progress' },
    { id: 'w', text: 'Waiting', status: 'waiting' },
  ]);
  await expect(page.locator('.todo-status[data-id="q"]')).toBeHidden();
  await expect(page.locator('.todo-status[data-id="w"]')).toBeVisible();
  await expect(page.locator('.todo-status[data-id="w"]')).toContainText('Waiting');
  await page.click('.todo-expand-toggle[data-id="q"]', { force: true });
  await expect(page.locator('.todo-status[data-id="q"]')).toBeVisible(); // editable once expanded
});

test('priority: High and Medium are chips at rest, Low only appears when the row is expanded', async ({ page }) => {
  await openWith(page, [
    { id: 'h', text: 'High', priority: 'high' },
    { id: 'm', text: 'Medium', priority: 'med' },
    { id: 'l', text: 'Low', priority: 'low' },
  ]);
  await expect(page.locator('.todo-priority[data-id="h"]')).toBeVisible();
  await expect(page.locator('.todo-priority[data-id="m"]')).toBeVisible();
  await expect(page.locator('.todo-priority[data-id="l"]')).toBeHidden();
  await page.click('.todo-expand-toggle[data-id="l"]', { force: true });
  await expect(page.locator('.todo-priority[data-id="l"]')).toBeVisible();
});

test('the due date sits in the right column at rest and returns to the chip line when expanded', async ({ page }) => {
  await openWith(page, [{ id: 'd', text: 'Task with a due date', dueDate: iso(-3), repeat: 'weekly' }]);
  const due = page.locator('.todo-due[data-id="d"]');
  const row = page.locator('.todo-row[data-id="d"]');
  const rest = await due.evaluate((el) => ({ pos: getComputedStyle(el).position, right: el.getBoundingClientRect().right }));
  const rowRight = await row.evaluate((el) => el.getBoundingClientRect().right);
  expect(rest.pos).toBe('absolute');
  expect(rowRight - rest.right).toBeLessThan(16);
  await expect(due).toHaveClass(/overdue/);
  // Repeat shows once, as quiet text, not again on the date.
  await expect(page.locator('.todo-due[data-id="d"] .todo-due-repeat-icon')).toBeHidden();
  await expect(page.locator('.todo-repeat[data-id="d"]')).toContainText('Weekly');
  await page.click('.todo-expand-toggle[data-id="d"]', { force: true });
  expect(await due.evaluate((el) => getComputedStyle(el).position)).toBe('static');
});
