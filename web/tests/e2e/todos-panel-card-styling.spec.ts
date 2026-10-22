import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// No edit card: opening a task (click its background) shows "+ Add subtask" under it.
async function addSubtask(page: import('@playwright/test').Page, id: string, text: string) {
  if (!(await page.locator(`.todo-row[data-id="${id}"]`).evaluate((el) => el.classList.contains('expanded'))))
    await page.locator(`.todo-row[data-id="${id}"]`).click({ position: { x: 4, y: 10 } });
  await page.locator(`.todo-row[data-id="${id}"] .todo-subtask-add-btn`).click();
  await page.fill(`.todo-subtask-input[data-id="${id}"]`, text);
  await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
}

async function openTodosPanelWithTask(page: import('@playwright/test').Page, text: string) {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.remove();
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
  await page.fill('#todos-input', text);
  await page.press('#todos-input', 'Enter');
  await page.waitForTimeout(50);
  return page.locator('.todo-row').first();
}

// Between PR #402 and #420 every row got a card treatment (its own surface background, a 1px
// border, box-shadow on hover) with hover-reveal chips replacing click-to-expand. After three
// weeks of iterating on that card without it landing, reverted all the way back to how this
// looked before #402: a flat list, no border, no background distinct from the panel, and a
// chevron that click-to-expands a row to reveal its priority/status/due/link/repeat/subtasks --
// hovering alone reveals nothing. This file asserts that restored shape, not the card one.
// The 2026-10 redesign (owner-approved concept, after cards in #402-#420 and again later): flat rows
// grouped under status headings (see todos-grouped.spec.ts), no card border or surface. Since
// 2026-10-20 there is no edit card at all: settings live in the task menu (⋯ on hover, or right-click)
// and an open task shows its full title and subtasks.
test.describe('To-Dos panel: flat grouped rows with click-to-expand', () => {
  test('an open task row is flat: no border, no surface of its own', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Flat row styling check');
    const result = await page.evaluate(() => {
      const r = document.querySelector('.todo-row')!;
      return {
        rowBg: getComputedStyle(r).backgroundColor,
        rowBorder: getComputedStyle(r).borderTopWidth,
      };
    });
    expect(row).toBeTruthy();
    expect(result.rowBg).toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(result.rowBorder)).toBe(0);
  });

  test('hovering a row only highlights it and shows its ⋯; the menu holds every setting, there is no edit card', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Hover check');
    const id = await row.getAttribute('data-id');
    const before = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await expect(page.locator('.todo-expand-toggle, .todo-props, .todo-prop-opt, .todo-priority, .todo-status')).toHaveCount(0);
    await row.hover();
    await page.waitForTimeout(150);
    expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(before);
    await page.click(`.todo-more-btn[data-id="${id}"]`);
    for (const label of ['Pin', 'Waiting for…', 'Due date…', 'Link to row…', 'Delete']) {
      await expect(page.locator('.sb-context-menu .sb-context-item .sb-context-label', { hasText: label }).first()).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('.todo-row').first()).not.toHaveClass(/expanded/);
  });

  test('a completed row mutes its text without striking it through, not the whole row', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Complete check');
    const id = await row.getAttribute('data-id');
    const rowOpacityBefore = await row.evaluate(el => getComputedStyle(el).opacity);
    await page.click(`.todo-check[data-id="${id}"]`);
    // Done always starts folded; open it to see the task that just moved there.
    await page.click('#todos-completed-collapse-btn[aria-label="Show done tasks"]');
    await page.waitForTimeout(100);
    const result = await page.evaluate((id) => {
      const r = document.querySelector(`.todo-row[data-id="${id}"]`) as HTMLElement;
      const t = document.querySelector(`.todo-text[data-id="${id}"]`) as HTMLElement;
      return { rowOpacity: getComputedStyle(r).opacity, textDecoration: getComputedStyle(t).textDecorationLine };
    }, id);
    expect(result.rowOpacity).toBe(rowOpacityBefore); // the row itself doesn't dim
    expect(result.textDecoration).toBe('none'); // muted grey only, like a completed subtask
  });

  test('the panel stops above the status bar instead of running behind it', async ({ page }) => {
    await openTodosPanelWithTask(page, 'Status bar clearance check');
    const result = await page.evaluate(() => {
      const panel = document.getElementById('todos-panel')!;
      const statusbar = document.getElementById('statusbar')!;
      return { panelBottom: panel.getBoundingClientRect().bottom, statusbarTop: statusbar.getBoundingClientRect().top };
    });
    expect(result.panelBottom).toBeLessThanOrEqual(result.statusbarTop + 1); // +1 for sub-pixel rounding
  });

  // An open task's subtasks are a plain indented block -- no rule, no branch/tree connector, no
  // shaded background of its own.
  test('subtasks show under an open task with no left rule or branch connector; completed subtasks fold behind "N done"', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask plain-block check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!, 'First subtask');
    await page.waitForTimeout(100);
    await expect(page.locator('.todo-subtask-row')).toHaveCount(1);
    const result = await page.evaluate(() => {
      const list = document.querySelector('.todo-subtasks-list') as HTMLElement;
      const cs = getComputedStyle(list);
      const trunk = getComputedStyle(list, '::before');
      return { borderLeftWidth: parseFloat(cs.borderLeftWidth), trunkContent: trunk.content };
    });
    expect(result.borderLeftWidth).toBe(0);
    expect(result.trunkContent === 'none' || result.trunkContent === '""').toBe(true); // no branch ::before trunk
    // Completing it folds it behind "1 done"; clicking that shows it again, muted and not struck through.
    // A second subtask keeps the parent open (completing every subtask completes the task).
    await addSubtask(page, id!, 'Second subtask');
    await expect(page.locator('.todo-subtask-row')).toHaveCount(2);
    await page.locator('.todo-subtask-check').first().click();
    await expect(page.locator('.todo-subtask-row')).toHaveCount(1);
    const fold = page.locator(`.todo-subtasks-done-toggle[data-id="${id}"]`);
    await expect(fold).toHaveText('1 done');
    await fold.click();
    await expect(page.locator('.todo-subtask-row')).toHaveCount(2);
    expect(await page.locator('.todo-subtask-text.completed').evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none');
  });

  test('a multi-line subtask keeps its checkbox on the first line of text', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask alignment check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!, 'High level solution design and architecture and the submission in LeanIX for the architecture review board, plus enough words to wrap');
    const m = await page.locator('.todo-subtask-row').first().evaluate((r) => {
      const c = r.querySelector('.todo-subtask-check')!.getBoundingClientRect();
      const t = r.querySelector('.todo-subtask-text')!;
      const tr = t.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(t).lineHeight);
      return { lines: Math.round(tr.height / lh), offset: Math.abs((c.top + c.height / 2) - (tr.top + lh / 2)) };
    });
    expect(m.lines).toBeGreaterThan(1);
    expect(m.offset).toBeLessThanOrEqual(2);
  });

  // The subtask count is plain text ("0/1") on the right of the row, with no progress bar.
  test('the subtask count has no progress bar', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask count check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!, 'First subtask');
    const toggle = page.locator(`.todo-subtasks-toggle[data-id="${id}"]`);
    await expect(toggle).toHaveText('0/1');
    await toggle.click();
    await expect(page.locator(`.todo-row[data-id="${id}"]`)).not.toHaveClass(/expanded/);
    await expect(page.locator('.todo-subtasks-progress-track')).toHaveCount(0);
  });
});
