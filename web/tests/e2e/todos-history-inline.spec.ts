import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// To-Do version history is a flyout of the header ⋯ menu (owner, 2026-10-20): the last 5 versions,
// newest first, one click restores. Subtask and task text look the same while editing; an unfolded task has no grey fill.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const task = (id: string, text: string, extra: object = {}) =>
  ({ id, text, createdAt: Date.now(), done: false, status: 'none', priority: 'none', subtasks: [], ...extra });

async function open(page: import('@playwright/test').Page, todos: object[], revisions: object[] = []) {
  await page.addInitScript(([t, r]) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
    localStorage.setItem('sakura_todos_revisions_v1', JSON.stringify(r));
  }, [todos, revisions]);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}

test('⋯ › Version history lists the last 5 versions and one click restores', async ({ page }) => {
  const now = Date.now();
  // Seven stored (older limit was higher): only the newest five are listed.
  const revisions = Array.from({ length: 7 }, (_, i) => ({
    ts: now - (7 - i) * 3600_000, reason: 'Auto',
    todos: Array.from({ length: i + 1 }, (_, k) => task('r' + k, 'Old ' + k))
  }));
  await open(page, [task('a', 'Current task')], revisions);

  await page.locator('#todos-more-trigger').click();
  await expect(page.locator('#todos-history-menu')).not.toBeVisible();
  await page.locator('#todos-history-trigger').hover();
  const rows = page.locator('#todos-more-menu .todo-history-item');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('#todo-history-overlay, #todos-history-overlay')).toHaveCount(0);
  await expect(rows.first().locator('.todo-history-meta')).toHaveText('7 open, 0 done');
  await expect(rows.last().locator('.todo-history-meta')).toHaveText('3 open, 0 done');
  // The summary stays on one line.
  const box = await rows.first().boundingBox();
  expect(box!.height).toBeLessThan(40);

  await rows.nth(1).click(); // 6 tasks
  await expect(page.locator('#todos-more-menu')).not.toHaveClass(/open/);
  await expect(page.locator('#todos-body .todo-row')).toHaveCount(6);

  // Restoring saved the replaced list first, and storage keeps at most 5.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_revisions_v1')!));
  expect(stored.length).toBe(5);
  expect(stored[stored.length - 1].todos.map((t: { text: string }) => t.text)).toEqual(['Current task']);
});

test('with no versions the menu says so, and Save a version now adds one', async ({ page }) => {
  await open(page, [task('a', 'Only task')]);
  await page.locator('#todos-more-trigger').click();
  await page.locator('#todos-history-trigger').click();
  await expect(page.locator('#todos-history-inline .todo-dd-empty')).toHaveText('No earlier versions yet');
  await page.locator('#todos-history-save-btn').click();
  await page.locator('#todos-more-trigger').click();
  await page.locator('#todos-history-trigger').hover();
  await expect(page.locator('#todos-more-menu .todo-history-item')).toHaveCount(1);
});

test('the flyout opens with the keyboard and ← closes it', async ({ page }) => {
  await open(page, [task('a', 'Only task')], [{ ts: Date.now() - 3600_000, reason: 'Auto', todos: [task('a', 'Only task')] }]);
  await page.locator('#todos-more-trigger').click();
  await expect(page.locator('#todos-history-trigger')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#todos-history-menu .todo-history-item').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#todos-history-save-btn')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#todos-history-menu')).not.toBeVisible();
  await expect(page.locator('#todos-history-trigger')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#todos-export-pdf-item')).toBeFocused();
});

test('subtask editing looks like task editing; an unfolded task has no grey fill', async ({ page }) => {
  await open(page, [task('a', 'Parent task', { subtasks: [{ id: 's1', text: 'A subtask', done: false }, { id: 's2', text: 'Finished', done: true }] })]);
  const row = page.locator('#todos-body .todo-row[data-id="a"]');
  await row.getByRole('button', { name: 'Show subtasks' }).click();
  await expect(row).toHaveClass(/expanded/);
  await page.mouse.move(2, 2); // off the row, so the hover fill fades out
  await expect.poll(() => row.evaluate((r) => getComputedStyle(r).backgroundColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  const look = (sel: string) => page.locator(sel).first().evaluate((el) => {
    (el as HTMLElement).focus();
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, shadow: cs.boxShadow, radius: cs.borderRadius };
  });
  const taskLook = await look('#todos-body .todo-row[data-id="a"] .todo-text');
  const subLook = await look('#todos-body .todo-row[data-id="a"] .todo-subtask-text');
  expect(subLook).toEqual(taskLook);
  expect(taskLook.shadow).not.toBe('none');
});

test('the task menu keeps Priority and Status one click; Repeat and More are flyouts', async ({ page }) => {
  // Owner, 2026-10-20: "todo menu also looks too big, we can make it better with sub menus".
  await open(page, [task('a', 'Only task')]);
  await page.locator('#todos-body .todo-row[data-id="a"]').click({ button: 'right', position: { x: 4, y: 10 } });
  const menu = page.locator('.sb-context-menu').first();
  await expect(menu.locator(':scope > .sb-context-item')).toHaveText(['Add due date…', 'Add link…', 'Add subtask', /^Repeat\s*Off$/, 'Mark as complete', 'Focus on this', 'More', 'Delete task']);
  await menu.locator('.sb-context-item', { hasText: 'Repeat' }).hover();
  await page.locator('.sb-context-submenu .sb-context-item', { hasText: 'Weekdays' }).click();
  // @ts-expect-error -- read back through storage
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1'))[0].repeat)).toBe('weekdays');
  await page.locator('#todos-body .todo-row[data-id="a"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'More' }).hover();
  await expect(page.locator('.sb-context-submenu .sb-context-item')).toHaveText(['Rewrite with AI', 'Duplicate task', 'Copy task text', 'Move to top', 'Move to bottom']);
});
