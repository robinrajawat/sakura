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

// Click-to-expand (not hover) reveals priority/status/due/link/repeat/subtask-add -- a row's
// own .todo-expand-toggle chevron, or a click anywhere non-interactive on the row, toggles its
// .expanded class.
// There is no edit card: priority is set from the task menu (right-click or ⋯), and "+ Add subtask"
// is in the same menu.
async function setPriority(page: import('@playwright/test').Page, id: string, label: string) {
  await page.locator(`.todo-row[data-id="${id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-heading:text-is("Priority") + .sb-context-choices .sb-context-choice', { hasText: label }).click();
}
async function addSubtask(page: import('@playwright/test').Page, id: string) {
  await page.locator(`.todo-row[data-id="${id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Add subtask' }).click();
}

// The completion control is a circle (an outline ring at rest, the same light ring with a grey tick
// once done, so finished work stays the quietest thing on screen), left-leading the row. The per-subtask checkbox
// (.todo-subtask-check, a real <input type="checkbox"> styled to match) is the same shape.
// Priority has never doubled up on the ring's own color -- it's display:none entirely until
// either a priority is actually set or the row is expanded, at which point it's a plain neutral
// chip, so there's nothing for the ring itself to echo.
test.describe('The To-Dos completion control is a left-led circle', () => {
  test('the main task control is a circle, not a bordered square', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checkbox shape check');
    const id = await row.getAttribute('data-id');
    const radius = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('50%');
  });

  test('a checked task control is a light ring with a grey tick, not filled and not the accent', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checked fill check');
    const id = await row.getAttribute('data-id');
    const before = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).backgroundColor);
    await page.click(`.todo-check[data-id="${id}"]`);
    // The Completed section always starts collapsed; open it to see the task that just moved there.
    await page.click('#todos-completed-collapse-btn[aria-label="Expand completed"]');
    await page.waitForTimeout(100);
    const result = await page.evaluate((id) => {
      const cb = document.querySelector(`.todo-check[data-id="${id}"]`) as HTMLElement;
      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
      const toRgb = (hex: string) => {
        const m = hex.replace('#', '');
        const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
        return `rgb(${r}, ${g}, ${b})`;
      };
      return { bg: getComputedStyle(cb).backgroundColor, borderColor: getComputedStyle(cb).borderColor, accentRgb: toRgb(accent) };
    }, id);
    expect(result.bg).toBe(before); // not filled: the ring stays as light as an open task's
    expect(result.borderColor).not.toBe(result.accentRgb); // grey, never the accent
    const tick = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el, '::after').content);
    expect(tick).toBe('""'); // the tick is drawn
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

  // Priority reads via the colored dot after the title, not via the
  // checkbox ring -- the ring stays the same neutral color at every priority level.
  test('an unchecked control\'s ring color stays neutral regardless of priority', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority ring check');
    const id = await row.getAttribute('data-id');
    const plainColor = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderColor);
    await setPriority(page, id!, 'High');
    await page.waitForTimeout(100);
    const highColor = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderColor);
    expect(highColor).toBe(plainColor);
  });

  test('a checked control is the same grey regardless of priority', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority checked-state check');
    const id = await row.getAttribute('data-id');
    const plainColor = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderColor);
    await setPriority(page, id!, 'Medium'); // medium priority (amber -- distinct from accent)
    await page.click(`.todo-check[data-id="${id}"]`);
    // The Completed section always starts collapsed; open it to see the task that just moved there.
    await page.click('#todos-completed-collapse-btn[aria-label="Expand completed"]');
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
    expect(result.borderColor).not.toBe(result.accentRgb);
    expect(result.borderColor).toBe(plainColor); // the same neutral ring as an open task, not the medium-priority color
  });

  test('the per-subtask checkbox is also a circle', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox shape check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    // Subtask lists are open by default here -- no separate collapse step needed.
    const radius = await page.locator('.todo-subtask-check').first().evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('50%');
  });

  test('the per-subtask checkbox stays to the left of its subtask text', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox position check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => {
      const check = document.querySelector('.todo-subtask-check') as HTMLElement;
      const text = document.querySelector('.todo-subtask-text') as HTMLElement;
      return { checkLeft: check.getBoundingClientRect().left, textLeft: text.getBoundingClientRect().left };
    });
    expect(result.checkLeft).toBeLessThan(result.textLeft);
  });
});
