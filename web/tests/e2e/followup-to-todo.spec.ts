import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A thread follow-up can become a To-Do linked back to its row (owner decision 2026-10-19). The task
// is what the follow-up says, with its owner as an @mention. Finishing the task doesn't change the
// document: the follow-up shows "· To-Do done" and stays a follow-up until someone settles it.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page, owner: string, text: string) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(([owner, text]) => {
    const w = window as any;
    const n = (id: number, depth: number, t: string) => ({ id, depth, text: t, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    w.eval('ensureDocumentForEditing();');
    w.eval(`nodes = [${JSON.stringify(n(1, 0, 'Rollout'))}, ${JSON.stringify(n(2, 1, 'Pallet labels'))}]; rebuildParentIds(); nextId = 3;`);
    w.eval(`remarks = [{ id: 'f1', anchorNodeId: 2, person: 'Ana', date: '2026-10-19', text: ${JSON.stringify(text)}, createdAt: 1, status: 'followup', owner: ${JSON.stringify(owner)} }];`);
    w.eval(`nodes[1].marker = 'followup'; inlineExpandRemarksNodeIds = new Set([2]); render();`);
  }, [owner, text]);
}

// Opens the To-Dos panel unless it is open (a jump to a thread entry leaves the caret in it, where the shortcut doesn't apply).
async function openTodos(page: Page) {
  if (await page.locator('#todos-panel.open').count()) return;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+Shift+T');
}

const entry = (page: Page) => page.locator('.thread-entry:has(#inline-remark-text-f1)');
async function menuItem(page: Page, label: string) {
  await entry(page).locator('.node-remark-text-inline').click({ button: 'right' });
  return page.locator('.sb-context-menu, .context-menu, [role="menu"]').getByText(label, { exact: true });
}

test('a follow-up becomes a linked To-Do with its owner as a mention, and is not added twice', async ({ page }) => {
  await seed(page, 'Ana Lee', 'Confirm the label format with the carrier');
  await (await menuItem(page, 'Add to To-Dos')).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]'));
  expect(saved).toHaveLength(1);
  expect(saved[0].text).toBe('@Ana-Lee Confirm the label format with the carrier');
  expect(saved[0].nodeRef.nodeId).toBe(2);
  await expect(entry(page).locator('.thread-todo-note')).toHaveText('· in To-Dos');
  // The menu now opens the existing task instead of adding another.
  await expect(await menuItem(page, 'Open in To-Dos')).toBeVisible();
});

test('finishing the task marks the follow-up "To-Do done" but leaves the follow-up open', async ({ page }) => {
  await seed(page, '', 'Book the carrier slot');
  await (await menuItem(page, 'Add to To-Dos')).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+T');
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0].id);
  await page.click(`.todo-check[data-id="${id}"]`);
  await expect(entry(page).locator('.thread-todo-note.is-done')).toHaveText('· To-Do done');
  expect(await page.evaluate('nodes.find(n => n.id === 2).marker')).toBe('followup');
});

test('the task says who raised it and where it points; clicking that goes to the row, changing it is in the task menu', async ({ page }) => {
  await seed(page, '', 'Can they schedule before 7 AM?');
  await (await menuItem(page, 'Add to To-Dos')).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+T');
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0].id);
  const src = page.locator(`.todo-row[data-id="${id}"] .todo-source`);
  await expect(src).toContainText('From Ana');
  await expect(src).toContainText('Pallet labels');
  // At rest there is no "change link" control on the row; clicking the source line navigates.
  await expect(page.locator(`.todo-link[data-id="${id}"]`)).toBeHidden();
  await src.click();
  await expect(page.locator('#todo-link-popover.open, .todo-link-popover.open')).toHaveCount(0);
  // Going to the row doesn't also open the task (it used to, when the panel stayed open).
  await openTodos(page);
  await expect(page.locator(`.todo-row[data-id="${id}"]`)).toBeVisible();
  await expect(page.locator(`.todo-row[data-id="${id}"]`)).not.toHaveClass(/expanded/);
  // A click beside the text, on the same line, also goes to the row rather than opening the task.
  await src.locator('xpath=..').click({ position: { x: (await src.locator('xpath=..').boundingBox())!.width - 4, y: 6 } });
  await openTodos(page);
  await expect(page.locator(`.todo-row[data-id="${id}"]`)).not.toHaveClass(/expanded/);
  // The task menu is where the link is changed. Going to the row can close the panel a moment after
  // the click, so make sure the row is on screen (reopening the panel if needed) before right-clicking.
  await expect(async () => {
    await openTodos(page);
    await expect(page.locator(`.todo-row[data-id="${id}"]`)).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.locator(`.todo-row[data-id="${id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Change link…' }).click();
  await expect(page.locator('#todo-link-popover.open')).toHaveCount(1);
});

test('going to a task from a follow-up opens the thread at that entry; the menu changes the link', async ({ page }) => {
  await seed(page, '', 'We need to investigate this before we decide');
  await page.evaluate('inlineExpandRemarksNodeIds = new Set(); render();');
  await page.evaluate('addFollowupToTodos(nodes[1], remarks[0])');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
  expect(t.remarkId).toBe('f1');
  await page.keyboard.press('Control+Shift+T');
  await page.locator(`.todo-row[data-id="${t.id}"] .todo-source`).click();
  await expect(page.locator('#inline-remark-text-f1')).toBeVisible();
  // The source line only navigates; "Change link…" in the task menu changes it.
  await expect(page.locator('#todo-link-popover.open')).toHaveCount(0);
  await openTodos(page);
  await page.locator(`.todo-row[data-id="${t.id}"]`).click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Change link…' }).click();
  await expect(page.locator('#todo-link-popover.open')).toHaveCount(1);
});

test('a click that starts on the source line and ends just off it still goes to the row, not open the task', async ({ page }) => {
  await seed(page, '', 'We need to investigate this before we decide');
  await page.evaluate('addFollowupToTodos(nodes[1], remarks[0])');
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0].id);
  await openTodos(page);
  const b = (await page.locator(`.todo-row[data-id="${id}"] .todo-source-row-text`).boundingBox())!;
  // The hand moves a few pixels between press and release, off the line onto the task's padding.
  await page.mouse.move(b.x + 20, b.y + b.height - 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 22, b.y + b.height + 4);
  await page.mouse.up();
  await expect(page.locator('#inline-remark-text-f1')).toBeVisible();
  await openTodos(page);
  await expect(page.locator(`.todo-row[data-id="${id}"]`)).not.toHaveClass(/expanded/);
});
