import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 4: To-Dos on a phone, with what the old phone page had. A task swipes
// right to complete and left to delete (Undo in the toast), a vertical drag still scrolls, and each
// task's ⋯ menu is reachable without hover.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const now = Date.now();
    localStorage.setItem('sakura_todos_v1', JSON.stringify([
      { id: 't1', text: 'Call the plumber', done: false, createdAt: now },
      { id: 't2', text: 'Buy milk', done: false, createdAt: now },
      { id: 't3', text: 'Renew passport', done: false, createdAt: now }
    ]));
  });
  await page.goto('file://' + indexPath + '?layout=phone');
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await page.locator('#phone-menu-btn').click();
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  await expect(page.locator('#todos-body .todo-row')).toHaveCount(3);
});

const row = (page: Page, text: string) => page.locator('#todos-body .todo-row', { hasText: text }).first();
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]') as { id: string; text: string; done: boolean }[]);

async function drag(page: Page, text: string, dx: number, dy: number) {
  const box = (await row(page, text).locator('.todo-text').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('a swipe right completes a task', async ({ page }) => {
  await drag(page, 'Buy milk', 160, 4);
  await expect.poll(async () => (await stored(page)).find((t) => t.id === 't2')!.done).toBe(true);
  expect((await stored(page)).filter((t) => t.done).map((t) => t.id)).toEqual(['t2']);
});

test('a swipe left deletes a task, and Undo brings it back', async ({ page }) => {
  await drag(page, 'Call the plumber', -160, 4);
  await expect.poll(async () => (await stored(page)).map((t) => t.id)).toEqual(['t2', 't3']);
  const undo = page.locator('.toast-action-btn', { hasText: 'Undo' }).first();
  await expect(undo).toBeVisible();
  await undo.click();
  await expect.poll(async () => (await stored(page)).map((t) => t.id)).toEqual(['t1', 't2', 't3']);
});

test('a short swipe or a vertical drag changes nothing', async ({ page }) => {
  await drag(page, 'Renew passport', 40, 2);
  await drag(page, 'Renew passport', 8, 140);
  const list = await stored(page);
  expect(list.map((t) => t.id)).toEqual(['t1', 't2', 't3']);
  expect(list.every((t) => !t.done)).toBe(true);
  await expect(row(page, 'Renew passport')).toHaveCSS('transform', 'none');
});

test("each task's ⋯ menu shows without hover and opens", async ({ page }) => {
  const more = row(page, 'Buy milk').locator('.todo-more-btn');
  await expect(more).toBeVisible();
  await expect(more).toHaveCSS('opacity', '1');
  const box = (await more.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(36);
  await more.tap();
  const menu = page.locator('.sb-context-menu').first();
  await expect(menu).toBeVisible();
  // On top of the full-screen To-Dos panel, not behind it: the point at its middle is the menu.
  expect(await menu.evaluate((m) => { const r = m.getBoundingClientRect(); return m.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })).toBe(true);
  // AI is desktop-only (the plan's feature table), so the task menu has no Rewrite on a phone.
  await expect(menu).toContainText('Waiting for');
  await expect(menu).not.toContainText('Rewrite');
  // ⋯ sits in its row's line, beside the date rather than below it.
  const rowBox = (await row(page, 'Buy milk').locator('.todo-text').boundingBox())!;
  expect(Math.abs((box.y + box.height / 2) - (rowBox.y + rowBox.height / 2))).toBeLessThan(6);
});
