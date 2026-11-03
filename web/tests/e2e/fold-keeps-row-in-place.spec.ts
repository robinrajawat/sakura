import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-03: folding a row or opening/closing a note or thread "shifted the screen".
// render() rebuilds every row, and near the end of a document a fold left too little content
// below for the old scroll position, so the browser snapped the page down. The pressed row must
// stay where it was on screen.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1400, height: 900 });
});

async function seed(page: Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text, extra = {}) => Object.assign({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }, extra);
    const list = []; let id = 1; remarks = [];
    for (let i = 0; i < 30; i++) {
      const pid = id++;
      list.push(n(pid, 0, 'Parent ' + i, i % 2 ? {} : { note: '<p>One</p><p>Two</p><p>Three</p>' }));
      remarks.push({ id: 'r' + i, anchorNodeId: pid, person: 'Ana', date: '2026-10-14', text: 'A comment', createdAt: 1 });
      for (let j = 0; j < 6; j++) list.push(n(id++, 1, 'Child ' + i + '.' + j));
    }
    nodes = list; rebuildParentIds(); nextId = id; qaItems = []; diagrams = []; collapsedIds = new Set(); editingId = null; selectedId = null; render();
  `);
  // Scroll to the very end, so a fold leaves too little below for the old position.
  await page.evaluate(`document.getElementById('editor-pane').scrollTop = 1e6`);
}

const top = (page: Page, id: number) => page.evaluate(`Math.round(document.querySelector('.node-row[data-id="${id}"]').getBoundingClientRect().top)`);

async function press(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.up();
}

// The last parent whose row is fully on screen.
const lastParentOnScreen = (page: Page) => page.evaluate(`(() => {
  const box = document.getElementById('editor-pane').getBoundingClientRect();
  const rows = [...document.querySelectorAll('.node-row')].filter(r => { const b = r.getBoundingClientRect(); return b.top > box.top + 40 && b.bottom < box.bottom - 40 && nodes.find(x => x.id == r.dataset.id).depth === 0; });
  return +rows[0].dataset.id;
})()`) as Promise<number>;

test('folding and unfolding a row near the end keeps it in place', async ({ page }) => {
  await seed(page);
  const id = await lastParentOnScreen(page);
  const before = await top(page, id);
  await press(page, `.node-row[data-id="${id}"] .fold-dot`);
  expect(await page.evaluate(`collapsedIds.has(${id})`)).toBe(true);
  expect(await top(page, id)).toBe(before);
  await press(page, `.node-row[data-id="${id}"] .fold-dot`);
  expect(await page.evaluate(`collapsedIds.has(${id})`)).toBe(false);
  expect(await top(page, id)).toBe(before);
});

test('opening and closing a note or thread keeps the row in place', async ({ page }) => {
  await seed(page);
  const id = await lastParentOnScreen(page);
  await press(page, `.node-row[data-id="${id}"] .fold-dot`); // fold first: a short end of the document
  const before = await top(page, id);
  for (const dot of ['.node-remark-dot', '.node-remark-dot']) {
    await press(page, `.node-row[data-id="${id}"] ${dot}`);
    expect(await top(page, id)).toBe(before);
  }
});

test('the blank space added at the end goes away when scrolling up', async ({ page }) => {
  await seed(page);
  const id = await lastParentOnScreen(page);
  await press(page, `.node-row[data-id="${id}"] .fold-dot`);
  await expect(page.locator('#editor-pane .scroll-anchor-spacer')).toHaveCount(1);
  await page.evaluate(`document.getElementById('editor-pane').scrollTop = 0`);
  await expect(page.locator('#editor-pane .scroll-anchor-spacer')).toHaveCount(0);
});
