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

// A bordered square checkbox sitting to the left of the task text read as a plain HTML form
// control, not something that belonged on a card -- the completion control is now a circle
// (an outline ring at rest, filling solid with the accent color + a white checkmark once
// done), matching the Reminders/Things convention this is modeled on, and it moved from the
// left edge (ahead of the text) to the top-right corner of the card, as a flex sibling after
// .todo-main so it sits beside the first line of text rather than crowding the read order.
// The per-subtask checkbox (.todo-subtask-check, in the nested checklist under a task) got
// the same circular shape, but stayed to the left of its subtask text -- unlike the parent
// task, a subtask row has no separate priority/status/due chips competing for the right
// edge, so the checkbox itself is the row's natural leading anchor, and there's no longer a
// left guide-line bar next to it (redundant once the checkbox itself marks the column).
test.describe('The To-Dos completion control is a circle in the top-right of the card', () => {
  test('the main task control is a circle, not a bordered square', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checkbox shape check');
    const id = await row.getAttribute('data-id');
    const radius = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('50%');
  });

  test('a checked task control fills solid with the accent color and a white checkmark', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checked fill check');
    const id = await row.getAttribute('data-id');
    await page.click(`.todo-check[data-id="${id}"]`);
    await page.waitForTimeout(100);
    const result = await page.evaluate((id) => {
      const cb = document.querySelector(`.todo-check[data-id="${id}"]`) as HTMLElement;
      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
      const toRgb = (hex: string) => {
        const m = hex.replace('#', '');
        const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
        return `rgb(${r}, ${g}, ${b})`;
      };
      return { bg: getComputedStyle(cb).backgroundColor, accentRgb: toRgb(accent) };
    }, id);
    expect(result.bg).toBe(result.accentRgb);
  });

  test('the completion control sits to the right of the task text, not to its left', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Position check');
    const id = await row.getAttribute('data-id');
    const result = await page.evaluate((id) => {
      const check = document.querySelector(`.todo-check[data-id="${id}"]`) as HTMLElement;
      const text = document.querySelector(`.todo-text[data-id="${id}"]`) as HTMLElement;
      return { checkLeft: check.getBoundingClientRect().left, textLeft: text.getBoundingClientRect().left };
    }, id);
    expect(result.checkLeft).toBeGreaterThan(result.textLeft);
  });

  test('the per-subtask checkbox is also a circle', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox shape check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    // Subtask lists now start collapsed by default (see "Collapse sub-tasks by default" in
    // Settings) -- expand it to reach the row.
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    const radius = await page.locator('.todo-subtask-check').first().evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('50%');
  });

  test('the per-subtask checkbox stays to the left of its subtask text', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox position check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    const result = await page.evaluate(() => {
      const check = document.querySelector('.todo-subtask-check') as HTMLElement;
      const text = document.querySelector('.todo-subtask-text') as HTMLElement;
      return { checkLeft: check.getBoundingClientRect().left, textLeft: text.getBoundingClientRect().left };
    });
    expect(result.checkLeft).toBeLessThan(result.textLeft);
  });

  // .todo-subtask-row used align-items:center, so a subtask whose text wraps to several lines
  // got its checkbox centered on the whole block -- floating away from the text it belongs to
  // instead of marking its first line, unlike the parent task's own top-aligned .todo-check.
  test('a wrapped, multi-line subtask keeps its checkbox aligned with the first line, not centered on the block', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask wrap alignment check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A genuinely long subtask description that will wrap across at least three separate lines once rendered inside the narrow To-Dos panel width');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    const result = await page.evaluate(() => {
      const check = document.querySelector('.todo-subtask-check') as HTMLElement;
      const text = document.querySelector('.todo-subtask-text') as HTMLElement;
      return { checkTop: check.getBoundingClientRect().top, textTop: text.getBoundingClientRect().top, textHeight: text.getBoundingClientRect().height };
    });
    // Confirm the text actually wrapped to more than one line (a single line wouldn't test
    // anything here), then check the box sits near the text's own top, not its vertical center.
    expect(result.textHeight).toBeGreaterThan(30);
    expect(Math.abs(result.checkTop - result.textTop)).toBeLessThan(6);
  });
});
