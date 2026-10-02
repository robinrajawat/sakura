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

// PR #402 gave each row its own card treatment (a surface color distinct from the panel, a 1px
// border, box-shadow on hover) to replace what was previously a bare, borderless row. #407-#420
// then spent about three weeks iterating on that card's spacing/type scale/chip sizing without
// it ever landing -- a signal the card concept itself, not any one measurement, was the problem.
// Reverted back to a flat list: no border, no background distinct from the panel, zero gap
// between rows, just a plain hover highlight -- the same shape every row had before #402. The
// real interaction/bug fixes that happened to land in the same run of commits (a proper
// checkbox, hover-reveal chips instead of click-to-expand, collapsed-by-default subtasks, the
// branch connector on subtasks, the #tag/@mention fix, the panel/status-bar clearance fix) are
// covered by the tests below that remain unchanged.
test.describe('To-Dos panel rows are a flat list, not individually bordered cards', () => {
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

  test('adjacent rows have zero gap between them -- separation comes from hover alone', async ({ page }) => {
    await openTodosPanelWithTask(page, 'First task');
    await page.fill('#todos-input', 'Second task');
    await page.press('#todos-input', 'Enter');
    await page.waitForTimeout(50);

    const gap = await page.evaluate(() => getComputedStyle(document.getElementById('todos-body')!).gap);
    expect(parseFloat(gap)).toBe(0);
  });

  test('hovering a row gives it a plain background highlight, no border or shadow', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Hover check');
    const before = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await row.hover();
    await page.waitForTimeout(150);
    const result = await row.evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow, border: getComputedStyle(el).borderTopWidth }));
    expect(result.bg).not.toBe(before);
    expect(result.shadow).toBe('none');
    expect(parseFloat(result.border)).toBe(0);
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

  test('a completed row is visibly dimmed via opacity on the whole row', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Complete check');
    const id = await row.getAttribute('data-id');
    const beforeOpacity = await row.evaluate(el => getComputedStyle(el).opacity);
    await page.click(`.todo-check[data-id="${id}"]`);
    await page.waitForTimeout(100);
    const afterOpacity = await row.evaluate(el => getComputedStyle(el).opacity);
    expect(parseFloat(afterOpacity)).toBeLessThan(parseFloat(beforeOpacity));
  });

  // Priority reads at a glance via the colored dot in the priority chip (below the title), not
  // via any accent bar on the row -- a flat row has no border at all to carry one, at rest or
  // with subtasks expanded.
  test('a row has no border regardless of priority, even with subtasks expanded', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Priority no-border check');
    const id = await row.getAttribute('data-id');
    const plainBorder = await row.evaluate(el => getComputedStyle(el).borderLeftWidth);
    await row.hover();
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`);
    await page.click(`.todo-priority[data-id="${id}"]`); // now high priority
    // Each click above calls renderTodos(), which rebuilds the row's DOM and loses :hover (no
    // real mouse event fires on the newly-created element) -- re-hover before the next
    // hover-gated (not .set) control.
    await row.hover();
    await page.click(`.todo-subtask-add-btn[data-id="${id}"]`);
    await page.fill(`.todo-subtask-input[data-id="${id}"]`, 'A subtask');
    await page.press(`.todo-subtask-input[data-id="${id}"]`, 'Enter');
    await page.waitForTimeout(100);
    await page.click(`.todo-subtasks-toggle[data-id="${id}"]`);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const highBorder = await row.evaluate(el => getComputedStyle(el).borderLeftWidth);
    expect(parseFloat(plainBorder)).toBe(0);
    expect(highBorder).toBe(plainBorder);
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
  // one row dominate the list's height next to plain one-line tasks. Subtask lists now start
  // collapsed (settings.subtasksCollapsedByDefault defaults to true), showing just the
  // progress count until expanded, so row heights stay uniform at a glance.
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

  // The subtask list has no background tint of its own -- the branch connector (a vertical
  // trunk down the gutter with a short horizontal stub pointing at each subtask's own circle,
  // stopping a couple px short of it rather than touching) is what signals "this is a nested
  // checklist" now, so a separate shaded panel would be a redundant second cue. Not a plain
  // straight line down the block either (tried and dropped earlier for reading as an arbitrary
  // divider rather than a connector to anything) -- an actual tree structure instead.
  test('the subtask list has no background tint, just a branch trunk connecting each subtask circle', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Subtask shaded-block check');
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
    const result = await page.evaluate(() => {
      const list = document.querySelector('.todo-subtasks-list') as HTMLElement;
      const subtaskRows = Array.from(document.querySelectorAll('.todo-subtask-row')) as HTMLElement[];
      const texts = Array.from(document.querySelectorAll('.todo-subtask-text')) as HTMLElement[];
      const trunk = getComputedStyle(list, '::before');
      const stub0 = getComputedStyle(subtaskRows[0], '::before');
      const stub1 = getComputedStyle(subtaskRows[1], '::before');
      return {
        listBg: getComputedStyle(list).backgroundColor,
        trunkWidth: parseFloat(trunk.width),
        stub0Width: parseFloat(stub0.width),
        stub1Width: parseFloat(stub1.width),
        firstTopWidth: parseFloat(getComputedStyle(texts[0]).borderTopWidth),
        secondTopWidth: parseFloat(getComputedStyle(texts[1]).borderTopWidth),
      };
    });
    expect(result.listBg).toBe('rgba(0, 0, 0, 0)'); // no tint of its own -- the branch is the cue, not a shaded panel
    expect(result.trunkWidth).toBe(1); // a thin 1px vertical trunk down the gutter
    expect(result.stub0Width).toBe(6); // each subtask's own horizontal branch stub -- short of the circle, not touching it
    expect(result.stub1Width).toBe(6);
    // Still no divider between subtask rows -- the branch is the only connector, not a border.
    expect(result.firstTopWidth).toBe(0);
    expect(result.secondTopWidth).toBe(0);
  });

  // The title always gets its own full-width line, with chips/actions on a separate line below
  // (never sharing width with the title) -- a regression test for a real bug this structurally
  // prevents: sharing a line with the meta-row's reserved action-icon width could shrink the
  // title's available width enough to force a wrap on even a short title, and once wrapped,
  // native End-key behavior goes to the end of the current visual line, not the true end,
  // silently splitting typed text into the middle instead of appending it.
  test('typing after End appends to the true end of the title, not mid-string', async ({ page }) => {
    const row = await openTodosPanelWithTask(page, 'Title edit width check');
    const id = await row.getAttribute('data-id');
    await row.hover();
    await page.click(`.todo-priority[data-id="${id}"]`);
    // cyclePriority() calls renderTodos(), rebuilding the row's DOM and losing :hover -- re-hover
    // before the next hover-gated (not yet .set) control.
    await row.hover();
    await page.click(`.todo-status[data-id="${id}"]`);
    const textEl = page.locator(`.todo-text[data-id="${id}"]`);
    await textEl.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' more words');
    const result = await page.evaluate((id) => {
      const el = document.querySelector(`.todo-text[data-id="${id}"]`) as HTMLElement;
      return { text: el.textContent, offsetWidth: el.getBoundingClientRect().width };
    }, id);
    expect(result.text?.trim()).toBe('Title edit width check more words');
  });
});
