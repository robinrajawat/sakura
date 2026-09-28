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

// Each task in the desktop To-Dos panel used to render as a bare, borderless row -- no
// background, no border, no shadow, just 5px of padding directly against the panel's own
// background, so a list of several tasks read as one continuous, undifferentiated block instead
// of a set of distinct items. Now each row is its own card: a surface color distinct from the
// panel background, a 1px border, and enough padding/gap to actually separate from its
// neighbors -- an accent-tinted border + soft shadow on hover, a stronger accent border while
// expanded, and reduced opacity once completed, so a row's state is legible from its card
// treatment alone, not just its text styling.
test.describe('To-Dos panel rows read as distinct cards, not a flat list', () => {
  test('a row has its own surface color and border, distinct from the panel background', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Card styling check');
    const result = await page.evaluate(() => {
      const panel = document.getElementById('todos-panel')!;
      const r = document.querySelector('.todo-row')!;
      return {
        panelBg: getComputedStyle(panel).backgroundColor,
        rowBg: getComputedStyle(r).backgroundColor,
        rowBorder: getComputedStyle(r).borderTopWidth,
        rowRadius: getComputedStyle(r).borderRadius,
      };
    });
    expect(row).toBeTruthy();
    expect(result.rowBg).not.toBe(result.panelBg);
    expect(result.rowBg).not.toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(result.rowBorder)).toBeGreaterThan(0);
    expect(parseFloat(result.rowRadius)).toBeGreaterThan(0);
  });

  test('adjacent rows have visible spacing between their cards, not zero gap', async ({ page }) => {
    await openTodosPanelWithTask(page, 'First task');
    await page.fill('#todos-input', 'Second task');
    await page.press('#todos-input', 'Enter');
    await page.waitForTimeout(50);

    const gap = await page.evaluate(() => getComputedStyle(document.getElementById('todos-body')!).gap);
    expect(parseFloat(gap)).toBeGreaterThan(0);
  });

  test('hovering a row gives it an accent-tinted border and a shadow', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Hover check');
    const before = await row.evaluate(el => getComputedStyle(el).boxShadow);
    await row.hover();
    await page.waitForTimeout(150);
    const after = await row.evaluate(el => getComputedStyle(el).boxShadow);
    expect(after).not.toBe(before);
    expect(after).not.toBe('none');
  });

  test('an expanded row gets a stronger, accent-tinted border', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Expand check');
    const id = await row.getAttribute('data-id');
    const collapsedBorder = await row.evaluate(el => getComputedStyle(el).borderColor);
    await page.click(`.todo-expand-toggle[data-id="${id}"]`);
    await page.waitForTimeout(100);
    const expandedBorder = await row.evaluate(el => getComputedStyle(el).borderColor);
    expect(expandedBorder).not.toBe(collapsedBorder);
  });

  test('a completed row is visibly dimmed via opacity on the whole card', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Complete check');
    const id = await row.getAttribute('data-id');
    const beforeOpacity = await row.evaluate(el => getComputedStyle(el).opacity);
    await page.click(`.todo-check[data-id="${id}"]`);
    await page.waitForTimeout(100);
    const afterOpacity = await row.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(afterOpacity)).toBeLessThan(parseFloat(beforeOpacity));
  });
});
