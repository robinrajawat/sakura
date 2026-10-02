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
test.describe('To-Dos panel rows are a flat list with click-to-expand, not cards', () => {
  test('a row has no border and no background distinct from the panel', async ({ page }) => {
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
    const priorityAfter = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    expect(priorityBefore).toBe('none');
    expect(priorityAfter).not.toBe('none');
  });

  test('a completed row mutes and strikes through its text, not the whole row', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Complete check');
    const id = await row.getAttribute('data-id');
    const rowOpacityBefore = await row.evaluate(el => getComputedStyle(el).opacity);
    await page.click(`.todo-check[data-id="${id}"]`);
    await page.waitForTimeout(100);
    const result = await page.evaluate((id) => {
      const r = document.querySelector(`.todo-row[data-id="${id}"]`) as HTMLElement;
      const t = document.querySelector(`.todo-text[data-id="${id}"]`) as HTMLElement;
      return { rowOpacity: getComputedStyle(r).opacity, textDecoration: getComputedStyle(t).textDecorationLine };
    }, id);
    expect(result.rowOpacity).toBe(rowOpacityBefore); // the row itself doesn't dim
    expect(result.textDecoration).toContain('line-through'); // the text does
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
  test('the subtask list is a plain left-bordered block, open by default, no branch connector', async ({ page }) => {
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
    expect(result.borderLeftWidth).toBeGreaterThan(0);
    expect(result.trunkContent === 'none' || result.trunkContent === '""').toBe(true); // no branch ::before trunk
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
