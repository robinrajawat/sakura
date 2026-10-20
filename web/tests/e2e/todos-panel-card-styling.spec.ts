import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

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
// grouped under status headings (see todos-grouped.spec.ts), no card border or surface. The Now
// task (the one you chose to focus on) is a tinted row, not a card. Click-to-expand is unchanged.
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

  test('hovering a row reveals nothing -- only a background highlight, no chips', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Hover reveals nothing check');
    const id = await row.getAttribute('data-id');
    const before = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    const priorityBefore = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    await row.hover();
    await page.waitForTimeout(150);
    const after = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    const priorityAfter = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    expect(after).not.toBe(before); // a plain hover highlight does apply
    expect(priorityBefore).toBe('none');
    expect(priorityAfter).toBe('none'); // but hovering alone never reveals chips
  });

  test('clicking the expand chevron reveals priority/status/due/link/repeat/subtask-add', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Expand reveal check');
    const id = await row.getAttribute('data-id');
    const priorityBefore = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    await page.click(`.todo-expand-toggle[data-id="${id}"]`);
    await page.waitForTimeout(100);
    // Expanded, the row lists its properties; priority shows every option at once.
    await expect(page.locator(`.todo-prop-opt[data-id="${id}"][data-field="priority"]`)).toHaveCount(4);
    await expect(page.locator(`.todo-prop-opt[data-id="${id}"][data-field="status"]`)).toHaveCount(3); // None / In progress / Waiting
    await expect(page.locator(`.todo-due[data-id="${id}"]`)).toBeVisible();
    await expect(page.locator(`.todo-link[data-id="${id}"]`)).toBeVisible();
    await expect(page.locator(`.todo-subtask-add-btn[data-id="${id}"]`)).toBeVisible();
    expect(priorityBefore).toBe('none');
  });

  test('a completed row mutes its text without striking it through, not the whole row', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Complete check');
    const id = await row.getAttribute('data-id');
    const rowOpacityBefore = await row.evaluate(el => getComputedStyle(el).opacity);
    await page.click(`.todo-check[data-id="${id}"]`);
    // The Completed section always starts collapsed; open it to see the task that just moved there.
    await page.click('#todos-completed-collapse-btn[aria-label="Expand completed"]');
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

  // Subtask lists are open by default (not collapsed) and are a plain indented block with a
  // straight left border -- no branch/tree connector, no shaded background of its own.
  test('the subtask list is open by default with no left rule or branch connector; completed subtasks fold behind "N completed"', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask plain-block check');
    const id = await row.getAttribute('data-id');
    await page.click(`.todo-expand-toggle[data-id="${id}"]`);
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'First subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    // Open by default -- no extra click needed to see it.
    await expect(page.locator('.todo-subtask-row')).toHaveCount(1);
    const result = await page.evaluate(() => {
      const list = document.querySelector('.todo-subtasks-list') as HTMLElement;
      const cs = getComputedStyle(list);
      const trunk = getComputedStyle(list, '::before');
      return { borderLeftWidth: parseFloat(cs.borderLeftWidth), trunkContent: trunk.content };
    });
    expect(result.borderLeftWidth).toBe(0);
    expect(result.trunkContent === 'none' || result.trunkContent === '""').toBe(true); // no branch ::before trunk
    // Completing it folds it behind "1 completed"; clicking that shows it again, muted and not struck through.
    // A second subtask keeps the parent open (completing every subtask completes the task).
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'Second subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await expect(page.locator('.todo-subtask-row')).toHaveCount(2);
    await page.locator('.todo-subtask-check').first().click();
    await expect(page.locator('.todo-subtask-row')).toHaveCount(1);
    const fold = page.locator(`.todo-subtasks-done-toggle[data-id="${id}"]`);
    await expect(fold).toContainText('1 completed');
    await fold.click();
    await expect(page.locator('.todo-subtask-row')).toHaveCount(2);
    expect(await page.locator('.todo-subtask-text.completed').evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none');
  });

  test('a multi-line subtask keeps its circle on the first line of text', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask alignment check');
    const id = await row.getAttribute('data-id');
    await page.click(`.todo-expand-toggle[data-id="${id}"]`);
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'High level solution design and architecture and the submission in LeanIX for the architecture review board, plus enough words to wrap');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    const m = await page.locator('.todo-subtask-row').first().evaluate((r) => {
      const c = r.querySelector('.todo-subtask-check')!.getBoundingClientRect();
      const t = r.querySelector('.todo-subtask-text')!;
      const tr = t.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(t).lineHeight);
      return { lines: Math.round(tr.height / lh), offset: Math.abs((c.top + c.height / 2) - (tr.top + lh / 2)) };
    });
    expect(m.lines).toBeGreaterThan(1);
    expect(m.offset).toBeLessThanOrEqual(2);
  });

  // The subtask progress indicator is a small, plain gray bar (not a wide accent-tinted one).
  test('the subtask progress bar is small and gray, not accent-tinted', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask progress bar check');
    const id = await row.getAttribute('data-id');
    await page.click(`.todo-expand-toggle[data-id="${id}"]`);
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'First subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    const width = await page.locator('.todo-subtasks-progress-track').evaluate(el => getComputedStyle(el).width);
    expect(parseFloat(width)).toBeLessThan(40); // small, not a wide fixed-width bar
  });
});
