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

test('open tasks are grouped: Now (the focus task), then Doing, Up next and Waiting', async ({ page }) => {
  await openWith(page, [
    { id: 'a', text: 'In progress, later', status: 'progress', dueDate: iso(5) },
    { id: 'b', text: 'In progress, overdue', status: 'progress', dueDate: iso(-2), priority: 'high' },
    { id: 'c', text: 'Not started, focused', focus: true },
    { id: 'd', text: 'Waiting on someone', status: 'waiting' },
    { id: 'e', text: 'Blocked', status: 'blocked' },
    { id: 'f', text: 'In review', status: 'review' },
  ]);
  // Now = the task you chose, whatever its status, shown once (not repeated in its group).
  expect(await idsIn(page, '.todos-now')).toEqual(['c']);
  expect(await idsIn(page, '.todos-group-doing')).toEqual(['a', 'b']);
  await expect(page.locator('.todos-group-next')).toHaveCount(0);
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['d', 'e', 'f']);
  await expect(page.locator('.todos-now .todos-group-label')).toHaveText('Now');
  await expect(page.locator('.todos-group-hold .todos-group-label')).toContainText('Waiting');
});

test('nothing lands in Now on its own; right-click › Focus on this moves a task there, one at a time', async ({ page }) => {
  await openWith(page, [
    { id: 'high', text: 'High and overdue', status: 'progress', priority: 'high', dueDate: iso(-4) },
    { id: 'other', text: 'Other' },
  ]);
  await expect(page.locator('.todos-now')).toHaveCount(0);
  await page.locator('.todo-row[data-id="other"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.getByText('Focus on this', { exact: true }).click();
  expect(await idsIn(page, '.todos-now')).toEqual(['other']);
  await page.locator('.todo-row[data-id="high"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.getByText('Focus on this', { exact: true }).click();
  expect(await idsIn(page, '.todos-now')).toEqual(['high']);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved.filter((t: { focus?: boolean }) => t.focus).map((t: { id: string }) => t.id)).toEqual(['high']);
  await page.locator('.todo-row[data-id="high"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.getByText('Remove focus', { exact: true }).click();
  await expect(page.locator('.todos-now')).toHaveCount(0);
});

test('no task in focus means no Now section, and empty groups are not shown', async ({ page }) => {
  await openWith(page, [{ id: 'x', text: 'Plain' }]);
  await expect(page.locator('.todo-row[data-id="x"]')).toBeVisible();
  await expect(page.locator('.todos-now')).toHaveCount(0);
  await expect(page.locator('.todos-group-doing')).toHaveCount(0);
  await expect(page.locator('.todos-group-hold')).toHaveCount(0);
});

test('under Waiting only a reason shows, as a chip; the open task picks the reason', async ({ page }) => {
  await openWith(page, [
    { id: 'q', text: 'Doing', status: 'progress' },
    { id: 'w', text: 'Waiting', status: 'waiting' },
    { id: 'r', text: 'Review', status: 'review' },
  ]);
  await expect(page.locator('.todo-status[data-id="q"]')).toBeHidden();
  await expect(page.locator('.todo-status[data-id="w"]')).toBeHidden();
  await expect(page.locator('.todo-status[data-id="r"]')).toBeVisible();
  await expect(page.locator('.todo-status[data-id="r"]')).toContainText('Needs review');
  await page.click('.todo-expand-toggle[data-id="w"]', { force: true });
  await expect(page.locator('.todo-prop-opt[data-id="w"][data-field="status"][data-value="waiting"]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.todo-props .todo-prop-opts[aria-label="Waiting reason"] .todo-prop-opt[data-value="blocked"]').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]').find((t: { id: string }) => t.id === 'w'));
  expect(saved.status).toBe('blocked');
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['w', 'r']);
  // Blocked is still Waiting: the Status row keeps Waiting marked.
  await expect(page.locator('.todo-props .todo-prop-opts[aria-label="Status"] .todo-prop-opt[data-value="waiting"]')).toHaveAttribute('aria-pressed', 'true');
});

test('priority: a dot after the title at rest (High filled, Medium hollow), Low none; chips only when open', async ({ page }) => {
  await openWith(page, [
    { id: 'h', text: 'High', priority: 'high' },
    { id: 'm', text: 'Medium', priority: 'med' },
    { id: 'l', text: 'Low', priority: 'low' },
  ]);
  await expect(page.locator('.todo-row[data-id="h"] .todo-pri-dot')).toBeVisible();
  await expect(page.locator('.todo-row[data-id="h"] .todo-pri-dot')).toHaveAttribute('data-tip', 'High priority');
  await expect(page.locator('.todo-row[data-id="m"] .todo-pri-dot')).toHaveAttribute('data-priority', 'med');
  await expect(page.locator('.todo-row[data-id="l"] .todo-pri-dot')).toHaveCount(0);
  await expect(page.locator('.todo-priority[data-id="h"]')).toBeHidden();
  // The dot follows the title, to the right of the check circle and the text.
  const textRight = await page.locator('.todo-text[data-id="h"]').evaluate((el) => el.getBoundingClientRect().right);
  const dotLeft = await page.locator('.todo-row[data-id="h"] .todo-pri-dot').evaluate((el) => el.getBoundingClientRect().left);
  expect(dotLeft).toBeGreaterThanOrEqual(textRight);
  await page.click('.todo-expand-toggle[data-id="l"]', { force: true });
  await expect(page.locator('.todo-prop-opt[data-id="l"][data-field="priority"][data-value="low"]')).toHaveAttribute('aria-pressed', 'true');
});

test('at rest a task is one line: title left, due date on the right saying Overdue', async ({ page }) => {
  await openWith(page, [{ id: 'd', text: 'Task with a due date', dueDate: iso(-3), repeat: 'weekly' }]);
  const due = page.locator('.todo-due[data-id="d"]');
  const text = page.locator('.todo-text[data-id="d"]');
  const row = page.locator('.todo-row[data-id="d"]');
  await expect(due).toHaveClass(/overdue/);
  await expect(due).toContainText(/^Overdue · /);
  const [db, tb, rb] = await Promise.all([due.boundingBox(), text.boundingBox(), row.boundingBox()]);
  expect(Math.abs((db!.y + db!.height / 2) - (tb!.y + tb!.height / 2))).toBeLessThan(6); // same line
  expect(rb!.x + rb!.width - (db!.x + db!.width)).toBeLessThan(20); // right edge
  // Repeat shows once, as quiet text, not again on the date.
  await expect(page.locator('.todo-due[data-id="d"] .todo-due-repeat-icon')).toBeHidden();
  await expect(page.locator('.todo-repeat[data-id="d"]')).toContainText('Weekly');
});

test('long titles stop at two lines at rest; subtasks fold behind their count until the task is opened', async ({ page }) => {
  const long = 'A very long task title that keeps going '.repeat(8);
  await openWith(page, [
    { id: 'L', text: long },
    { id: 'S', text: 'With subtasks', subtasks: [{ id: 's1', text: 'First', done: false }, { id: 's2', text: 'Second', done: true }] },
  ]);
  const lines = await page.locator('.todo-text[data-id="L"]').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBe(2);
  await expect(page.locator('.todo-subtask-row[data-parent="S"]')).toHaveCount(0);
  await expect(page.locator('.todo-subtasks-toggle[data-id="S"]')).toContainText('1/2');
  await page.click('.todo-subtasks-toggle[data-id="S"]');
  await expect(page.locator('.todo-row[data-id="S"]')).toHaveClass(/expanded/);
  await expect(page.locator('.todo-subtask-row[data-parent="S"]')).toHaveCount(1);
});

test('the open row sets priority and status in one click, and moves the task to its new group', async ({ page }) => {
  await openWith(page, [{ id: 'k', text: 'Plain task' }]);
  await expect(page.locator('#todos-add-row')).not.toContainText('N'); // no shortcut badge
  await page.click('.todo-expand-toggle[data-id="k"]', { force: true });
  await page.click('.todo-prop-opt[data-id="k"][data-field="priority"][data-value="high"]');
  await page.click('.todo-prop-opt[data-id="k"][data-field="status"][data-value="waiting"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(saved.priority).toBe('high');
  expect(saved.status).toBe('waiting');
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['k']);
  await expect(page.locator('.todo-row[data-id="k"]')).toHaveClass(/expanded/); // stays open where it moved
});
