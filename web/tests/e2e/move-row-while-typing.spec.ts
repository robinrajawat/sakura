import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error — globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Aaa', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 0, text: 'Bbb', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 3, depth: 0, text: 'Ccc', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 4;
    // @ts-expect-error
    render(); beginEditAt(3, 1);
  });
  await page.locator('#in-3').focus();
});

const texts = (page) =>
  // @ts-expect-error — global from index.html
  page.evaluate(() => nodes.map((n) => n.text));

test('Alt+Up and Alt+Down move the row being typed in, and typing carries on where the cursor was', async ({ page }) => {
  await page.keyboard.press('Alt+ArrowUp');
  expect(await texts(page)).toEqual(['Aaa', 'Ccc', 'Bbb']);
  await expect(page.locator('#in-3')).toBeFocused();
  await page.keyboard.type('X');
  // @ts-expect-error — global from index.html
  await page.evaluate(() => commitEdit());
  expect(await texts(page)).toEqual(['Aaa', 'CXcc', 'Bbb']);

  // @ts-expect-error — global from index.html
  await page.evaluate(() => beginEditAt(3, 0));
  await page.locator('#in-3').focus();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await texts(page)).toEqual(['Aaa', 'Bbb', 'CXcc']);
  await expect(page.locator('#in-3')).toBeFocused();
});

test('moving a row shows no toast', async ({ page }) => {
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(300);
  await expect(page.getByText('Moved up')).toHaveCount(0);
});
