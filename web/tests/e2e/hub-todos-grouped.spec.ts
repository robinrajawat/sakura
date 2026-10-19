import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// hub.html matches the desktop To-Dos panel (2026-10): a Now card, then Doing / Up next / On hold,
// chips only where the heading doesn't already say it, and one-tap Priority / Status in the sheet.

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

async function openHub(page: Page, todos: object[]) {
  const full = todos.map((t) => ({ createdAt: Date.now(), completedAt: null, done: false, status: 'none', priority: 'none', dueDate: null, link: null, linkLabel: null, nodeRef: null, repeat: null, subtasks: [], subtasksOpen: true, ...t }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((t) => localStorage.setItem('sakura_todos_v1', JSON.stringify(t)), full);
  await page.goto('file://' + hubPath);
  // Signed-in view without Firebase: the same steps onSignedIn takes before its cloud pull.
  await page.evaluate(() => {
    const w = window as any;
    document.getElementById('auth-gate')!.style.display = 'none';
    document.getElementById('hub-app')!.style.display = 'block';
    w.eval("currentUser = { displayName: 'Test User' }; loadTodosLocal(); renderTodos();");
  });
}

const idsAfter = (page: Page, labelSel: string) =>
  page.locator(`${labelSel} + .swipe-list .swipe-row`).evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id')));

test('hub groups tasks like desktop: Now, Doing, Up next, On hold', async ({ page }) => {
  await openHub(page, [
    { id: 'a', text: 'In progress, later', status: 'progress', dueDate: iso(5) },
    { id: 'b', text: 'In progress, overdue', status: 'progress', dueDate: iso(-2), priority: 'high' },
    { id: 'c', text: 'Not started', priority: 'low' },
    { id: 'd', text: 'Waiting', status: 'waiting', priority: 'med' },
  ]);
  expect(await idsAfter(page, '.todo-now-label')).toEqual(['b']);
  expect(await idsAfter(page, '.todo-group-doing')).toEqual(['a']);
  expect(await idsAfter(page, '.todo-group-next')).toEqual(['c']);
  expect(await idsAfter(page, '.todo-group-hold')).toEqual(['d']);
  // Chips only where they add something: High / Medium, and the On hold status; Low stays off the row.
  await expect(page.locator('.swipe-row[data-id="b"] .todo-pri.pr-high')).toHaveText('High');
  await expect(page.locator('.swipe-row[data-id="b"] .todo-row-due.overdue')).toBeVisible();
  await expect(page.locator('.swipe-row[data-id="c"] .todo-pri')).toHaveCount(0);
  await expect(page.locator('.swipe-row[data-id="d"] .todo-st')).toHaveText('Waiting');
  await expect(page.locator('.swipe-row[data-id="a"] .todo-st')).toHaveCount(0);
});

test('the task sheet sets priority and status in one tap', async ({ page }) => {
  await openHub(page, [{ id: 'k', text: 'Plain task' }]);
  await page.evaluate(() => (window as any).openTaskDetail('k'));
  await page.click('#task-detail-priority-opts .todo-detail-opt[data-value="high"]');
  await page.click('#task-detail-status-opts .todo-detail-opt[data-value="blocked"]');
  await expect(page.locator('#task-detail-status-opts .todo-detail-opt[data-value="blocked"]')).toHaveAttribute('aria-pressed', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(saved.priority).toBe('high');
  expect(saved.status).toBe('blocked');
  expect(await idsAfter(page, '.todo-group-hold')).toEqual(['k']);
});
