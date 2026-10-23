import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const iso = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

async function openWith(page: import('@playwright/test').Page, todos: object[]) {
  const full = todos.map((t) => ({ createdAt: Date.now(), done: false, subtasks: [], ...t }));
  await page.addInitScript((t) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
  }, full);
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}

const openMenu = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`.todo-row[data-id="${id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });
const menuItem = (page: import('@playwright/test').Page, label: string | RegExp) =>
  page.locator('.sb-context-menu:not(.sb-context-submenu) > .sb-context-item').filter({ has: page.locator('.sb-context-label', { hasText: label }) }).first();
const idsIn = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(`${sel} .todo-row`).evaluateAll((rows) => rows.map((r) => r.getAttribute('data-id')));
const stored = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));

test('open tasks show in sections: Pinned, Today (incl. overdue), Upcoming, Anytime, Waiting; Done folds (owner, 2026-10-21)', async ({ page }) => {
  await openWith(page, [
    { id: 'a', text: 'No date' },
    { id: 'o', text: 'Overdue', dueDate: iso(-2) },
    { id: 't', text: 'Today', dueDate: iso(0) },
    { id: 'u', text: 'Later', dueDate: iso(30) },
    { id: 'p', text: 'Pinned, overdue', pinned: true, dueDate: iso(-1) },
    { id: 'w', text: 'Waiting on someone', waitingFor: 'Ana', dueDate: iso(0) },
    { id: 'd', text: 'Done', done: true, completedAt: Date.now() },
  ]);
  expect(await idsIn(page, '.todos-group-pinned')).toEqual(['p']);
  expect(await idsIn(page, '.todos-group-today')).toEqual(['o', 't']);
  expect(await idsIn(page, '.todos-group-upcoming')).toEqual(['u']);
  expect(await idsIn(page, '.todos-group-anytime')).toEqual(['a']);
  expect(await idsIn(page, '.todos-group-waiting')).toEqual(['w']);
  const labels = await page.locator('#todos-body .todos-group-label').allTextContents();
  // No counts (the header says how many are open); every section, Done included, has one grey icon.
  expect(labels).toEqual(['Pinned', 'Today', 'Upcoming', 'Anytime', 'Waiting']);
  for (const label of await page.locator('#todos-body .todos-group-label, #todos-body .todos-section-label').all()) {
    await expect(label.locator('.todos-section-icon')).toHaveCount(1);
  }
  await expect(page.locator('.todos-header-sep')).toHaveCount(0);
  // Done is one folded line; nothing done means no Done line at all.
  await expect(page.locator('#todos-completed-collapse-btn')).toHaveText('Done1');
  await expect(page.locator('.todo-row[data-id="d"]')).toHaveCount(0);
  // Red means overdue, and only the date says it.
  const color = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).color);
  expect(await color('.todo-row[data-id="o"] .todo-due')).not.toBe(await color('.todo-row[data-id="t"] .todo-due'));
  await expect(page.locator('.todo-row[data-id="o"] .todo-due')).toHaveClass(/overdue/);
});

test('older lists migrate on open: Now and In progress become pinned, Waiting / Blocked / Needs review wait for the first @mention, priority goes', async ({ page }) => {
  await openWith(page, [
    { id: 'f', text: 'Focus task', focus: true, priority: 'high' },
    { id: 'g', text: 'Doing', status: 'progress' },
    { id: 'b', text: 'Ask @Karsten about slots', status: 'blocked' },
    { id: 'r', text: 'Review deck', status: 'review', priority: 'med' },
  ]);
  expect(await idsIn(page, '.todos-group-pinned')).toEqual(['f', 'g']);
  expect(await idsIn(page, '.todos-group-waiting')).toEqual(['b', 'r']);
  await expect(page.locator('.todo-row[data-id="b"] .todo-waiting-line')).toHaveText('Waiting for Karsten');
  await expect(page.locator('.todo-row[data-id="r"] .todo-waiting-line')).toHaveText('Waiting', { useInnerText: true });
  // The next save writes the new shape.
  await page.locator('.todo-row[data-id="r"] .todo-check').click();
  const saved = await stored(page);
  for (const t of saved) { expect(t).not.toHaveProperty('priority'); expect(t).not.toHaveProperty('status'); expect(t).not.toHaveProperty('focus'); }
  expect(saved.find((t: { id: string }) => t.id === 'b')).toMatchObject({ waitingFor: 'Karsten' });
});

test('the task menu is short and plain: Pin, Waiting for…, Due date…, Repeat, Link to row…, Rewrite with AI, Copy, Delete', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Plain task' }]);
  await openMenu(page, 'a');
  const labels = await page.locator('.sb-context-menu:not(.sb-context-submenu) > .sb-context-item .sb-context-label').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Pin', 'Waiting for…', 'Due date…', 'Repeat', 'Link to row…', 'Rewrite with AI', 'Copy', 'Delete']);
  await expect(page.locator('.todo-edit-card, .todo-props')).toHaveCount(0);
});

test('Pin moves a task to Pinned (any number of them); Unpin puts it back', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }]);
  await openMenu(page, 'a');
  await menuItem(page, /^Pin$/).click();
  await openMenu(page, 'b');
  await menuItem(page, /^Pin$/).click();
  expect(await idsIn(page, '.todos-group-pinned')).toEqual(['a', 'b']);
  await openMenu(page, 'a');
  await menuItem(page, 'Unpin').click();
  expect(await idsIn(page, '.todos-group-pinned')).toEqual(['b']);
  expect(await idsIn(page, '.todos-group-anytime')).toEqual(['a']);
});

test('Waiting for… is typed on the row itself: any text, names suggested, Enter keeps it, emptying it stops waiting', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Confirm capacity with @Karsten' }, { id: 'b', text: 'Ping @Ana' }]);
  await openMenu(page, 'a');
  await menuItem(page, 'Waiting for…').click();
  await expect(page.locator('.sb-context-submenu')).toHaveCount(0); // no flyout
  const name = page.locator('.todo-row[data-id="a"] .todo-waiting-name');
  await expect(name).toBeFocused();
  // Known names are suggested under the caret; typing narrows them.
  await expect(page.locator('.sb-context-menu .sb-context-item')).toHaveText([/Ana|Karsten/, /Ana|Karsten/]);
  await page.keyboard.type('Kar');
  await expect(page.locator('.sb-context-menu .sb-context-item')).toHaveText(['Karsten']);
  await page.locator('.sb-context-menu .sb-context-item').click();
  expect(await idsIn(page, '.todos-group-waiting')).toEqual(['a']);
  await expect(page.locator('.todo-row[data-id="a"] .todo-waiting-line')).toHaveText(/^Waiting for Karsten · since /);
  // Any text works, not just a person: click the name and edit it in place.
  await page.locator('.todo-row[data-id="a"] .todo-waiting-name').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('vendor quote for the new licences');
  await page.keyboard.press('Enter');
  expect((await stored(page)).find((t: { id: string }) => t.id === 'a')).toMatchObject({ waitingFor: 'vendor quote for the new licences' });
  await expect(page.locator('#sakura-modal-input')).toBeHidden();
  // Esc cancels an edit.
  await page.locator('.todo-row[data-id="a"] .todo-waiting-name').click();
  await page.keyboard.type(' XYZ');
  await page.keyboard.press('Escape'); // no name matches, so no suggestions: one Esc cancels
  await expect(page.locator('.todo-row[data-id="a"] .todo-waiting-name')).toHaveText('vendor quote for the new licences');
  // Emptying it stops waiting.
  await page.locator('.todo-row[data-id="a"] .todo-waiting-name').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Enter');
  expect(await idsIn(page, '.todos-group-anytime')).toEqual(['a', 'b']);
  await expect(page.locator('.todo-waiting-line')).toHaveCount(0);
});

test('the menu ends waiting with Not waiting; Esc on a new waiting line leaves the task as it was', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Order licences', waitingFor: 'Procurement' }, { id: 'b', text: 'Plain' }]);
  await openMenu(page, 'a');
  await menuItem(page, 'Not waiting').click();
  await expect(page.locator('.todo-waiting-line')).toHaveCount(0);
  await openMenu(page, 'b');
  await menuItem(page, 'Waiting for…').click();
  await expect(page.locator('.todo-row[data-id="b"] .todo-waiting-name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.todo-waiting-line')).toHaveCount(0);
  expect((await stored(page)).find((t: { id: string }) => t.id === 'b')).not.toHaveProperty('waitingFor');
});

test('a row is one line: title, then subtask count, repeat, link arrow and the date on the right', async ({ page }) => {
  await openWith(page, [
    { id: 'a', text: 'Weekly report', dueDate: iso(0), repeat: 'weekly' },
    { id: 'b', text: 'Release', subtasks: [{ id: 's1', text: 'Build', done: true }, { id: 's2', text: 'Ship', done: false }] },
    { id: 'c', text: 'Read spec', link: 'https://example.com/spec' },
  ]);
  await expect(page.locator('.todo-row[data-id="a"] .todo-side .todo-due')).toHaveText('Today');
  await expect(page.locator('.todo-row[data-id="a"] .todo-side .todo-repeat-icon')).toBeVisible();
  await expect(page.locator('.todo-row[data-id="b"] .todo-side .todo-subtasks-toggle')).toHaveText('1/2');
  await expect(page.locator('.todo-row[data-id="c"] .todo-side a.todo-jump')).toHaveAttribute('href', 'https://example.com/spec');
  // Text and side share the first line.
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const text = await box('.todo-row[data-id="a"] .todo-text');
  const due = await box('.todo-row[data-id="a"] .todo-due');
  expect(Math.abs(text.y - due.y)).toBeLessThan(6);
  expect(due.x).toBeGreaterThan(text.x + text.width - 1);
});

test('long titles: two lines at rest, the full text while editing in place and when the task is open (owner, 2026-10-22)', async ({ page }) => {
  const long = 'Clean up the architecture diagram in LeanIX — remove outdated systems, check interface IF-2231 (SAP S/4 → WMS) and IF-2240, and document the new event topics on the wiki before the steering call with the integration team next week';
  await openWith(page, [{ id: 'a', text: long }]);
  const text = page.locator('.todo-row[data-id="a"] .todo-text');
  const lineH = await text.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect((await text.boundingBox())!.height).toBeLessThan(lineH * 2 + 4);
  // A click on the title edits it, at full length, without opening the task.
  await text.click();
  await expect(text).toBeFocused();
  expect((await text.boundingBox())!.height).toBeGreaterThan(lineH * 2 + 4);
  await expect(page.locator('.todo-row[data-id="a"]')).not.toHaveClass(/expanded/);
  // Shift+Enter adds a line break, Enter saves.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Ticket INC-48213');
  await page.keyboard.press('Enter');
  expect((await stored(page))[0].text).toBe(long + '\nTicket INC-48213');
  // Clicking the background opens the task: the full title stays shown.
  await page.locator('.todo-row[data-id="a"]').click({ position: { x: 4, y: 10 } });
  await expect(page.locator('.todo-row[data-id="a"]')).toHaveClass(/expanded/);
  expect((await text.boundingBox())!.height).toBeGreaterThan(lineH * 2 + 4);
});

test('an open task shows its open subtasks, an "N done" foot and where it links to', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Release', link: 'https://example.com/r', linkLabel: 'Release notes', subtasks: [{ id: 's1', text: 'Build', done: true }, { id: 's2', text: 'Ship', done: false }] }]);
  await page.locator('.todo-row[data-id="a"] .todo-subtasks-toggle').click();
  await expect(page.locator('.todo-row[data-id="a"] .todo-subtask-row')).toHaveCount(1);
  await expect(page.locator('.todo-row[data-id="a"] .todo-subtasks-done-toggle')).toHaveText('1 done');
  await expect(page.locator('.todo-row[data-id="a"] .todo-source-row')).toHaveText(/Link\s*Release notes/);
  // Fold state is not saved with the task.
  expect((await stored(page))[0]).not.toHaveProperty('unfolded');
});

test('the ⋯ button takes the date\'s place while the row is hovered', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Task', dueDate: iso(0) }]);
  const more = page.locator('.todo-row[data-id="a"] .todo-more-btn');
  await expect(more).toHaveCSS('opacity', '0');
  await page.locator('.todo-row[data-id="a"]').hover();
  await expect(more).toHaveCSS('opacity', '1');
  await expect(page.locator('.todo-row[data-id="a"] .todo-due')).toHaveCSS('visibility', 'hidden');
  await more.click();
  await expect(menuItem(page, /^Pin$/)).toBeVisible();
});

test('the due date picker is the shared calendar: the due day is marked and a click moves it', async ({ page }) => {
  await openWith(page, [{ id: 'a', text: 'Report', dueDate: iso(0) }]);
  await openMenu(page, 'a');
  await menuItem(page, 'Due date…').click();
  const pop = page.locator('#todo-due-popover');
  await expect(pop).toHaveClass(/open/);
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await expect(pop.locator('.due-pop-cal-day.selected')).toHaveAttribute('data-date', today);
  await pop.locator('#due-pop-cal-next').click();
  await pop.locator('.due-pop-cal-day[data-date]').first().click();
  await expect(pop).not.toHaveClass(/open/);
  expect((await stored(page))[0].dueDate).toMatch(/^\d{4}-\d{2}-01$/);
});
