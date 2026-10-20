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

// The task menu (right-click or ⋯) holds Priority, Status and the Waiting reason as one-click choices.
const menuChoices = (page: import('@playwright/test').Page, heading: string) =>
  page.locator(`.sb-context-menu .sb-context-heading:text-is("${heading}") + .sb-context-choices .sb-context-choice`);
const openMenu = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`.todo-row[data-id="${id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });

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
  // The heading marks Now; the row itself has no tint, so it isn't mistaken for the selected row.
  expect(await page.locator('.todos-now .todo-row').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
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

test('under Waiting only a reason shows, as a chip; the task menu picks the reason', async ({ page }) => {
  await openWith(page, [
    { id: 'q', text: 'Doing', status: 'progress' },
    { id: 'w', text: 'Waiting', status: 'waiting' },
    { id: 'r', text: 'Review', status: 'review' },
  ]);
  await expect(page.locator('.todo-status[data-id="q"]')).toBeHidden();
  await expect(page.locator('.todo-status[data-id="w"]')).toBeHidden();
  await expect(page.locator('.todo-status[data-id="r"]')).toBeVisible();
  await expect(page.locator('.todo-status[data-id="r"]')).toContainText('Needs review');
  await openMenu(page, 'w');
  await expect(menuChoices(page, 'Status').filter({ hasText: 'Waiting' })).toHaveAttribute('aria-pressed', 'true');
  await menuChoices(page, 'Waiting reason').filter({ hasText: 'Blocked' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]').find((t: { id: string }) => t.id === 'w'));
  expect(saved.status).toBe('blocked');
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['w', 'r']);
  // Blocked is still Waiting: the Status row keeps Waiting marked.
  await openMenu(page, 'w');
  await expect(menuChoices(page, 'Status').filter({ hasText: 'Waiting' })).toHaveAttribute('aria-pressed', 'true');
  await expect(menuChoices(page, 'Waiting reason').filter({ hasText: 'Blocked' })).toHaveAttribute('aria-pressed', 'true');
});

test('priority: a dot after the title (High filled, Medium hollow), Low none; clicking the dot opens the menu', async ({ page }) => {
  await openWith(page, [
    { id: 'h', text: 'High', priority: 'high' },
    { id: 'm', text: 'Medium', priority: 'med' },
    { id: 'l', text: 'Low', priority: 'low' },
  ]);
  await expect(page.locator('.todo-row[data-id="h"] .todo-pri-dot')).toBeVisible();
  await expect(page.locator('.todo-row[data-id="h"] .todo-pri-dot')).toHaveAttribute('data-tip', /^High priority/);
  await expect(page.locator('.todo-row[data-id="m"] .todo-pri-dot')).toHaveAttribute('data-priority', 'med');
  await expect(page.locator('.todo-row[data-id="l"] .todo-pri-dot')).toHaveCount(0);
  await expect(page.locator('.todo-priority[data-id="h"]')).toBeHidden();
  // The dot follows the title, to the right of the check circle and the text.
  const textRight = await page.locator('.todo-text[data-id="h"]').evaluate((el) => el.getBoundingClientRect().right);
  const dotLeft = await page.locator('.todo-row[data-id="h"] .todo-pri-dot').evaluate((el) => el.getBoundingClientRect().left);
  expect(dotLeft).toBeGreaterThanOrEqual(textRight);
  await page.click('.todo-row[data-id="m"] .todo-pri-dot');
  await expect(menuChoices(page, 'Priority').filter({ hasText: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
  await menuChoices(page, 'Priority').filter({ hasText: 'High' }).click();
  await expect(page.locator('.todo-row[data-id="m"] .todo-pri-dot')).toHaveAttribute('data-priority', 'high');
  await expect(page.locator('.todo-row[data-id="m"]')).not.toHaveClass(/expanded/); // no edit view
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
  expect(rb!.x + rb!.width - (db!.x + db!.width)).toBeLessThan(44); // right edge, before the hover ⋯
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

test('the task menu sets priority and status in one click and moves the task to its new group; there is no edit card', async ({ page }) => {
  await openWith(page, [{ id: 'k', text: 'Plain task' }]);
  await expect(page.locator('#todos-add-row')).not.toContainText('N'); // no shortcut badge
  await expect(page.locator('.todo-expand-toggle, .todo-props')).toHaveCount(0);
  await page.locator('.todo-row[data-id="k"]').hover();
  await expect(page.locator('.todo-more-btn[data-id="k"]')).toBeVisible();
  await page.click('.todo-more-btn[data-id="k"]');
  await menuChoices(page, 'Priority').filter({ hasText: 'High' }).click();
  await page.locator('.todo-row[data-id="k"]').hover();
  await page.click('.todo-more-btn[data-id="k"]');
  await menuChoices(page, 'Status').filter({ hasText: 'Waiting' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(saved.priority).toBe('high');
  expect(saved.status).toBe('waiting');
  expect(await idsIn(page, '.todos-group-hold')).toEqual(['k']);
});

test('unfolding a task (its count, or the cut-off title) shows the full title and subtasks (no grey fill), with a "N done" foot; it is kept', async ({ page }) => {
  const long = 'A very long task title that keeps going '.repeat(8);
  await openWith(page, [
    { id: 'L', text: long },
    { id: 'S', text: 'With subtasks', subtasks: [{ id: 's1', text: 'First', done: false }, { id: 's2', text: 'Second', done: true }, { id: 's3', text: 'Third', done: true }] },
  ]);
  // A click on a cut-off title unfolds it to its full length (it doesn't start editing).
  await page.click('.todo-text[data-id="L"]');
  await expect(page.locator('.todo-row[data-id="L"]')).toHaveClass(/expanded/);
  const lines = await page.locator('.todo-text[data-id="L"]').evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeGreaterThan(2);
  // No fill or card once the pointer leaves it (owner: "why are we highlighting a task?").
  await page.mouse.move(2, 2);
  await expect.poll(() => page.locator('.todo-row[data-id="L"]').evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).boxShadow])).toEqual(['rgba(0, 0, 0, 0)', 'none']);
  // The count unfolds the subtasks: open ones listed, done ones are "2 done" in the foot.
  await page.click('.todo-subtasks-toggle[data-id="S"]');
  await expect(page.locator('.todo-subtask-row[data-parent="S"]')).toHaveCount(1);
  await expect(page.locator('.todo-subtasks-done-toggle[data-id="S"]')).toHaveText('2 done');
  await page.click('.todo-subtasks-done-toggle[data-id="S"]');
  await expect(page.locator('.todo-subtask-row[data-parent="S"]')).toHaveCount(3);
  await expect(page.locator('.todo-subtasks-done-toggle[data-id="S"]')).toHaveText('Hide 2 done');
  // "+ Add subtask" shows while the task is hovered.
  await page.mouse.move(0, 0);
  await expect(page.locator('.todo-subtask-add-btn[data-id="S"]')).toHaveCSS('opacity', '0');
  await page.locator('.todo-row[data-id="S"]').hover();
  await expect(page.locator('.todo-subtask-add-btn[data-id="S"]')).toHaveCSS('opacity', '1');
  await page.click('.todo-subtask-add-btn[data-id="S"]');
  await page.fill('.todo-subtask-input[data-id="S"]', 'Fourth');
  await page.keyboard.press('Enter');
  await expect(page.locator('.todo-subtask-row[data-parent="S"]', { hasText: 'Fourth' })).toHaveCount(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved.filter((t: { unfolded?: boolean }) => t.unfolded).map((t: { id: string }) => t.id).sort()).toEqual(['L', 'S']);
  // The count folds it back.
  await page.click('.todo-subtasks-toggle[data-id="S"]');
  await expect(page.locator('.todo-subtask-row[data-parent="S"]')).toHaveCount(0);
});

test('the white edit box shows only while the title is being typed in', async ({ page }) => {
  await openWith(page, [{ id: 'e', text: 'Short title' }]);
  const text = page.locator('.todo-text[data-id="e"]');
  expect(await text.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
  await text.click();
  await expect(text).toBeFocused();
  expect(await text.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await expect(page.locator('.todo-row[data-id="e"]')).not.toHaveClass(/expanded/);
});
