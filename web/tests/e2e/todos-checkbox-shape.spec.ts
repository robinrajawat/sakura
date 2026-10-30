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

// Opening a task (click its background) shows "+ Add subtask" under it.
async function addSubtask(page: import('@playwright/test').Page, id: string) {
  await page.locator(`.todo-row[data-id="${id}"]`).click({ position: { x: 4, y: 10 } });
  await page.locator(`.todo-row[data-id="${id}"] .todo-subtask-add-btn`).click();
}

// The completion control is a small rounded square (owner-approved mockup todos-final-model-mockup.png,
// 2026-10-21): an outline at rest, the same light outline with a grey tick once done, so finished work
// stays the quietest thing on screen, left-leading the row. The per-subtask checkbox matches.
test.describe('The To-Dos completion control is a left-led rounded square', () => {
  test('the main task control is a rounded square', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checkbox shape check');
    const id = await row.getAttribute('data-id');
    const radius = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('6px'); // small corner on the 4/6/8/12 scale (2026-10-30);
  });

  test('a checked task control is a light ring with a grey tick, not filled and not the accent', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Checked fill check');
    const id = await row.getAttribute('data-id');
    const before = await page.locator(`.todo-check[data-id="${id}"]`).evaluate(el => getComputedStyle(el).backgroundColor);
    await page.click(`.todo-check[data-id="${id}"]`);
    // Done always starts folded; open it to see the task that just moved there.
    await page.click('#todos-completed-collapse-btn[aria-label="Show done tasks"]');
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

  test('the per-subtask checkbox is also a rounded square', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask checkbox shape check');
    const id = await row.getAttribute('data-id');
    await addSubtask(page, id!);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    const radius = await page.locator('.todo-subtask-check').first().evaluate(el => getComputedStyle(el).borderRadius);
    expect(radius).toBe('4px');
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
