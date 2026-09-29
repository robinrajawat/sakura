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

// The completion control is a circle (an outline ring at rest, filling solid with the accent
// color + a white checkmark once done), matching the Reminders/Things/Todoist convention this
// is modeled on. After trying it on the right (top-right corner of the card) for a while, the
// whole card was redesigned around Todoist's convention instead: the circle leads the row on
// the LEFT, and its ring color at rest doubles as the priority signal (see the priority-ring
// tests below) -- removing the need for a separate accent bar elsewhere on the card entirely.
// The per-subtask checkbox (.todo-subtask-check) matches in shape and position (also left-led),
// but stays neutral (--hint) since subtasks don't carry their own priority.
test.describe('The To-Dos completion control is a left-led circle whose ring signals priority', () => {
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

  test('the completion control sits to the left of the task text, not to its right', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Position check');
    const id = await row.getAttribute('data-id');
    const result = await page.evaluate((id) => {
      const check = document.querySelector(`.todo-check[data-id="${id}"]`) as HTMLElement;
      const text = document.querySelector(`.todo-text[data-id="${id}"]`) as HTMLElement;
      return { checkLeft: check.getBoundingClientRect().left, textLeft: text.getBoundingClientRect().left };
    }, id);
    expect(result.checkLeft).toBeLessThan(result.textLeft);
  });

  // The ring IS the priority signal now -- no separate accent bar elsewhere on the card. Same
  // color tokens as .todo-priority[data-priority], so the pill (still the control that cycles
  // priority) and the ring always agree.
  test('an unchecked control\'s ring color reflects its priority', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority ring check');
    const id = await row.getAttribute('data-id');
    const plainColor = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderColor);
    await row.hover();
    // Cycle none -> low -> med -> high.
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.mouse.move(0, 0); // away from the row, so :hover doesn't mask the ring color
    await page.waitForTimeout(100);
    const highColor = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderColor);
    expect(highColor).not.toBe(plainColor);
    expect(highColor).toBe('rgb(194, 85, 61)'); // #c2553d, the same token .todo-priority[data-priority="high"] uses
  });

  test('a checked control always fills solid accent, regardless of priority', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority checked-state check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`); // now medium priority (amber, #d1a23a -- distinct from accent)
    await page.click(`.todo-check[data-id="${id}"]`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const result = await page.evaluate((id) => {
      const cb = document.querySelector(`.todo-check[data-id="${id}"]`) as HTMLElement;
      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
      const toRgb = (hex: string) => {
        const m = hex.replace('#', '');
        const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
        return `rgb(${r}, ${g}, ${b})`;
      };
      return { borderColor: getComputedStyle(cb).borderColor, accentRgb: toRgb(accent) };
    }, id);
    expect(result.borderColor).toBe(result.accentRgb);
    expect(result.borderColor).not.toBe('rgb(209, 162, 58)'); // not the medium-priority color
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
