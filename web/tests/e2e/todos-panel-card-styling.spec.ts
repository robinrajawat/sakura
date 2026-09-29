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

  // There is no more click-to-expand state -- a row's unset chips (priority/status/due/link/
  // repeat) and its action icons reveal on hover/focus alone, so a plain task never needs a
  // click just to discover what can be set on it.
  test('hovering a row reveals its unset chip placeholders, with no expand click required', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Hover reveal check');
    const id = await row.getAttribute('data-id');
    const priorityBefore = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    await row.hover();
    await page.waitForTimeout(100);
    const priorityAfter = await page.locator(`.todo-priority[data-id="${id}"]`).evaluate(el => getComputedStyle(el).display);
    expect(priorityBefore).toBe('none');
    // Computed as 'flex', not 'inline-flex' -- the declared inline-flex gets blockified because
    // .todo-priority is itself a flex item of .todo-meta-row (CSS Display Level 3 blockification).
    expect(priorityAfter).toBe('flex');
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

  // Priority now reads at a glance via the completion circle's own ring color (see
  // todos-checkbox-shape.spec.ts) instead of a separate accent bar on the card -- so the card's
  // own border should stay neutral no matter what priority is set, even with subtasks expanded
  // (a card-level accent bar would have run the full height of an expanded card; there's no
  // such bar to run at all now).
  test('the card border itself stays neutral regardless of priority, even with subtasks expanded', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority no-card-accent check');
    const id = await row.getAttribute('data-id');
    const plainBorder = await row.evaluate(el => getComputedStyle(el).borderLeftColor);
    await row.hover();
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`); // now high priority
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    await page.mouse.move(0, 0); // away from the row, so :hover doesn't also tint the border
    await page.waitForTimeout(100);
    const highBorder = await row.evaluate(el => getComputedStyle(el).borderLeftColor);
    expect(highBorder).toBe(plainBorder);
    expect(highBorder).not.toBe('rgb(194, 85, 61)'); // not the high-priority color
  });

  // The docked side panels (To-Dos among them) are position:fixed with bottom:0 against the
  // raw viewport, which let the panel run in behind the status bar at the foot of the window
  // instead of stopping above it. It should now stop flush with the status bar's own top
  // edge, tracked live via the --statusbar-h custom property.
  test('the panel stops above the status bar instead of running behind it', async ({ page }) => {
    await openTodosPanelWithTask(page, 'Status bar clearance check');
    const result = await page.evaluate(() => {
      const panel = document.getElementById('todos-panel')!;
      const statusbar = document.getElementById('statusbar')!;
      return { panelBottom: panel.getBoundingClientRect().bottom, statusbarTop: statusbar.getBoundingClientRect().top };
    });
    expect(result.panelBottom).toBeLessThanOrEqual(result.statusbarTop + 1); // +1 for sub-pixel rounding
  });

  // A task with several subtasks used to always render its full checklist inline, making that
  // one card dominate the list's height next to plain one-line tasks. Subtask lists now start
  // collapsed (settings.subtasksCollapsedByDefault defaults to true), showing just the
  // progress count until expanded, so card heights stay uniform at a glance.
  test('a new subtask list starts collapsed, showing only the progress count', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask default-collapsed check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'First subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    await expect(page.locator(`.todo-subtasks-progress-track`)).toBeVisible();
    await expect(page.locator('.todo-subtask-row')).toHaveCount(0);
    // Expanding via the chevron still reveals it.
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    await expect(page.locator('.todo-subtask-row')).toHaveCount(1);
  });

  // With the parent task's own completion circle back on the left, the subtask list's guide
  // line now reads as a tree trunk descending from it, with each subtask a branch off it --
  // indentation + the trunk + each subtask's own circle separate items clearly, the way a
  // real file-tree does, without needing a separate horizontal divider between rows too.
  test('the subtask list has a guide-line trunk, and no per-row divider', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask tree-line check');
    const id = await row.getAttribute('data-id');
    for (const text of ['First subtask', 'Second subtask']) {
      // Each addSubtask() call fully rebuilds the row's DOM, which loses :hover (no real
      // mouse event fires on the newly-created element), so re-hover before every click.
      await row.hover();
      await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
      await page.fill(`.todo-subtask-input[data-id="${id}"]`, text);
      await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
      await page.waitForTimeout(100);
    }
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    const rows = page.locator('.todo-subtask-row');
    await expect(rows).toHaveCount(2);
    const result = await page.evaluate((id) => {
      const list = document.querySelector('.todo-subtasks-list') as HTMLElement;
      const cardBorder = document.querySelector(`.todo-row[data-id="${id}"]`) as HTMLElement;
      const texts = Array.from(document.querySelectorAll('.todo-subtask-text')) as HTMLElement[];
      return {
        listGuideWidth: parseFloat(getComputedStyle(list).borderLeftWidth),
        listGuideColor: getComputedStyle(list).borderLeftColor,
        cardBorderColor: getComputedStyle(cardBorder).borderTopColor,
        firstTopWidth: parseFloat(getComputedStyle(texts[0]).borderTopWidth),
        secondTopWidth: parseFloat(getComputedStyle(texts[1]).borderTopWidth),
      };
    }, id);
    expect(result.listGuideWidth).toBeGreaterThan(0);
    expect(result.listGuideColor).not.toBe(result.cardBorderColor); // not the low-contrast --border token
    // No divider between subtask rows -- the trunk + indentation already separate them.
    expect(result.firstTopWidth).toBe(0);
    expect(result.secondTopWidth).toBe(0);
  });
});
