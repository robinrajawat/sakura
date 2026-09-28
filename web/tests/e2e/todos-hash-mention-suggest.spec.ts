import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function openTodosPanel(page: import('@playwright/test').Page) {
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.remove();
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}

async function addTask(page: import('@playwright/test').Page, text: string) {
  await page.fill('#todos-input', text);
  await page.press('#todos-input', 'Enter');
  await page.waitForTimeout(50);
}

// commitTodoAtSuggest (clicking a #tag/@mention suggestion) already wrote the chosen word
// straight into the todos array via editTodoText -- correctly -- then called renderTodos() to
// repaint it. But renderTodos() has its own separate safeguard that commits whatever
// .todo-text is *currently focused* before tearing the list down, in case some OTHER task's
// edit was still in progress and about to be lost. That safeguard didn't know the just-clicked
// suggestion had already been committed a moment earlier, so it always re-read the still-
// focused element's *stale* live DOM text (the tag was never actually typed into the
// characters on screen, only spliced into the array) and saved that right back over the
// correct value -- clicking a suggestion looked like it worked (the popup closed) but silently
// discarded the tag/mention every single time.
test.describe('Clicking a #tag or @mention suggestion in a To-Do actually inserts it', () => {
  test('clicking a suggested #tag inserts it into the task text', async ({ page }) => {
    await openTodosPanel(page);
    await addTask(page, 'Existing task with #urgent tag');
    await addTask(page, 'New task');

    const row = page.locator('.todo-row', { hasText: 'New task' });
    const id = await row.getAttribute('data-id');
    const textEl = page.locator(`.todo-text[data-id="${id}"]`);
    await textEl.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' #ur');
    await page.waitForTimeout(100);

    await page.click('#at-suggest .at-suggest-item');
    await page.waitForTimeout(150);

    // renderTodoTextHtml deliberately appends a zero-width space (&#8203;) right after every
    // rendered #tag/@mention chip, as a caret-placement aid -- strip it before comparing, same
    // as editTodoText itself does when it normalizes stored text.
    const finalText = await page.locator(`.todo-text[data-id="${id}"]`).textContent();
    expect(finalText?.replace(/​/g, '').trim()).toBe('New task #urgent');
  });

  test('clicking a suggested @mention inserts it into the task text', async ({ page }) => {
    await openTodosPanel(page);
    await addTask(page, 'New task');

    const row = page.locator('.todo-row', { hasText: 'New task' });
    const id = await row.getAttribute('data-id');
    const textEl = page.locator(`.todo-text[data-id="${id}"]`);
    await textEl.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' @tod');
    await page.waitForTimeout(100);

    await page.click('#at-suggest .at-suggest-item');
    await page.waitForTimeout(150);

    const finalText = await page.locator(`.todo-text[data-id="${id}"]`).textContent();
    expect(finalText?.replace(/​/g, '').trim().toLowerCase()).toBe('new task @today');
  });

  // The safeguard this fix narrowed still has to do its original job: catch a genuinely
  // uncommitted mid-edit on one task when an unrelated action on another task forces a
  // renderTodos() rebuild, so those keystrokes aren't silently lost.
  test('an unrelated action on another row still commits a still-focused, never-explicitly-committed edit', async ({ page }) => {
    await openTodosPanel(page);
    await addTask(page, 'Task A');
    await addTask(page, 'Task B');

    const rowA = page.locator('.todo-row', { hasText: 'Task A' });
    const idA = await rowA.getAttribute('data-id');
    await page.locator(`.todo-text[data-id="${idA}"]`).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' extra words');
    await page.waitForTimeout(100);

    // Trigger renderTodos() via an unrelated action on Task B, without blurring Task A first.
    const rowB = page.locator('.todo-row', { hasText: 'Task B' });
    const idB = await rowB.getAttribute('data-id');
    await page.click(`.todo-check[data-id="${idB}"]`);
    await page.waitForTimeout(150);

    const finalTextA = await page.locator(`.todo-text[data-id="${idA}"]`).textContent();
    expect(finalTextA?.trim()).toBe('Task A extra words');
  });
});
