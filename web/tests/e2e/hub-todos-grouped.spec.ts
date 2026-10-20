import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// hub.html matches the desktop To-Dos panel (2026-10-20): Now (the focus task), then Doing / Up next /
// Waiting, a priority dot after the title, a chip only for a Waiting reason, and one-tap Priority /
// Status (plus Reason and Focus) in the sheet.

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

test('hub groups tasks like desktop: Now (focus), Doing, Up next, Waiting', async ({ page }) => {
  await openHub(page, [
    { id: 'a', text: 'In progress, later', status: 'progress', dueDate: iso(5), focus: true },
    { id: 'b', text: 'In progress, overdue', status: 'progress', dueDate: iso(-2), priority: 'high' },
    { id: 'c', text: 'Not started', priority: 'low' },
    { id: 'd', text: 'Waiting', status: 'waiting', priority: 'med' },
    { id: 'r', text: 'Review', status: 'review' },
  ]);
  expect(await idsAfter(page, '.todo-now-label')).toEqual(['a']);
  expect(await idsAfter(page, '.todo-group-doing')).toEqual(['b']);
  expect(await idsAfter(page, '.todo-group-next')).toEqual(['c']);
  expect(await idsAfter(page, '.todo-group-hold')).toEqual(['d', 'r']);
  await expect(page.locator('.todo-group-hold')).toContainText('Waiting');
  // A dot for High / Medium; Low stays off the row. Overdue says so.
  await expect(page.locator('.swipe-row[data-id="b"] .todo-pri-dot.pr-high')).toHaveCount(1);
  await expect(page.locator('.swipe-row[data-id="d"] .todo-pri-dot.pr-med')).toHaveCount(1);
  await expect(page.locator('.swipe-row[data-id="c"] .todo-pri-dot')).toHaveCount(0);
  await expect(page.locator('.swipe-row[data-id="b"] .todo-row-due.overdue')).toContainText(/^Overdue · /);
  // Only a Waiting reason is a chip.
  await expect(page.locator('.swipe-row[data-id="d"] .todo-st')).toHaveCount(0);
  await expect(page.locator('.swipe-row[data-id="r"] .todo-st')).toHaveText('Needs review');
});

test('the task sheet sets priority, status and reason in one tap, and Focus moves the task to Now', async ({ page }) => {
  await openHub(page, [{ id: 'k', text: 'Plain task' }, { id: 'z', text: 'Other', focus: true }]);
  await page.evaluate(() => (window as any).openTaskDetail('k'));
  await page.click('#task-detail-priority-opts .todo-detail-opt[data-value="high"]');
  await expect(page.locator('#task-detail-reason-prop')).toBeHidden();
  await page.click('#task-detail-status-opts .todo-detail-opt[data-value="waiting"]');
  await page.click('#task-detail-reason-opts .todo-detail-opt[data-value="blocked"]');
  await expect(page.locator('#task-detail-status-opts .todo-detail-opt[data-value="waiting"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#task-detail-reason-opts .todo-detail-opt[data-value="blocked"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#task-detail-focus-chip');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved[0].priority).toBe('high');
  expect(saved[0].status).toBe('blocked');
  expect(saved.filter((t: { focus?: boolean }) => t.focus).map((t: { id: string }) => t.id)).toEqual(['k']);
  expect(await idsAfter(page, '.todo-now-label')).toEqual(['k']);
});
