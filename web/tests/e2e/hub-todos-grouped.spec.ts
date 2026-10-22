import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// hub.html matches the desktop To-Dos panel (2026-10-21): sections Pinned, Today, Upcoming, Anytime,
// Waiting; the row says who a task waits for; the sheet sets Waiting for and Pin.

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

async function openHub(page: Page, todos: object[]) {
  const full = todos.map((t) => ({ createdAt: Date.now(), completedAt: null, done: false, dueDate: null, link: null, linkLabel: null, nodeRef: null, repeat: null, subtasks: [], ...t }));
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

test('hub groups tasks like desktop: Pinned, Today, Upcoming, Anytime, Waiting (older lists migrated)', async ({ page }) => {
  await openHub(page, [
    { id: 'a', text: 'Focus, later', dueDate: iso(5), focus: true },
    { id: 'b', text: 'Overdue', dueDate: iso(-2), priority: 'high' },
    { id: 'u', text: 'Later', dueDate: iso(9) },
    { id: 'c', text: 'No date', priority: 'low' },
    { id: 'd', text: 'Ask @Karsten', status: 'waiting' },
  ]);
  expect(await idsAfter(page, '.todo-group-pinned')).toEqual(['a']);
  expect(await idsAfter(page, '.todo-group-today')).toEqual(['b']);
  expect(await idsAfter(page, '.todo-group-upcoming')).toEqual(['u']);
  expect(await idsAfter(page, '.todo-group-anytime')).toEqual(['c']);
  expect(await idsAfter(page, '.todo-group-waiting')).toEqual(['d']);
  await expect(page.locator('.swipe-row[data-id="b"] .todo-row-due.overdue')).toContainText(/^Overdue · /);
  await expect(page.locator('.swipe-row[data-id="d"] .todo-row-meta')).toHaveText('Waiting for Karsten');
  await expect(page.locator('.todo-pri-dot, .todo-st')).toHaveCount(0);
});

test('the task sheet sets Waiting for and Pin; clearing the name stops waiting', async ({ page }) => {
  await openHub(page, [{ id: 'k', text: 'Plain task' }, { id: 'z', text: 'Other', pinned: true }]);
  await page.evaluate(() => (window as any).openTaskDetail('k'));
  await page.fill('#task-detail-waiting', 'Ana');
  await page.locator('#task-detail-waiting').blur();
  expect(await idsAfter(page, '.todo-group-waiting')).toEqual(['k']);
  await page.click('#task-detail-pin-chip');
  await expect(page.locator('#task-detail-pin-chip')).toHaveAttribute('aria-pressed', 'true');
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved[0]).toMatchObject({ waitingFor: 'Ana', pinned: true });
  expect(await idsAfter(page, '.todo-group-pinned')).toEqual(['k', 'z']);
  await page.fill('#task-detail-waiting', '');
  await page.locator('#task-detail-waiting').blur();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved[0]).not.toHaveProperty('waitingFor');
});
