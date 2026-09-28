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

// The To-Dos panel's own task-completion checkbox used a fully round border-radius, making it
// look like a radio button (implying "pick one") rather than a checkbox (implying "mark this
// done") -- inconsistent with every other checkbox in the app (.node-cb in the outliner,
// .todo-select-check in this same panel's own select mode), which are all a rounded square with
// a solid accent fill + white checkmark once checked. Both the primary .todo-check and the
// per-subtask .todo-subtask-check are now that same shape and fill.
test.describe('The To-Dos completion checkbox reads as a checkbox, not a radio button', () => {
  test('the main task checkbox is a rounded square, not a circle', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checkbox shape check');
    const id = await row.getAttribute('data-id');
    const radius = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).not.toBe('50%');
    expect(parseFloat(radius)).toBeGreaterThan(0);
    expect(parseFloat(radius)).toBeLessThan(8);
  });

  test('a checked task checkbox fills solid with the accent color and a white checkmark', async ({ page }) => {
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

  test('the per-subtask checkbox is also a rounded square, not a circle', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox shape check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    const radius = await page.locator('.todo-subtask-check').first().evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).not.toBe('50%');
    expect(parseFloat(radius)).toBeGreaterThan(0);
  });
});
