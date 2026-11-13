import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 3: light editing by touch. While a row is being typed in, a toolbar
// sits above the keyboard (outdent, indent, checkbox, move up, move down, Done) and keeps the row
// in edit; a long-press on a row opens its short menu. Same edit functions as the desktop.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, depth: number, text: string, parentId: number | null) =>
      ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_e', JSON.stringify({ nodes: [n(1, 0, 'First', null), n(2, 0, 'Second', null), n(3, 0, 'Third', null)], nextId: 4, collapsed: [], title: 'Edit' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'e', title: 'Edit', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'e');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Third');
});

// @ts-expect-error -- bare global from index.html
const rows = (page: Page) => page.evaluate(() => nodes.map((n: { text: string; depth: number; isCheckbox: boolean }) => `${n.depth}:${n.isCheckbox ? '[] ' : ''}${n.text}`) as string[]);
// @ts-expect-error -- bare global from index.html
const editing = (page: Page) => page.evaluate(() => (editingId === null ? null : nodes.find((n: { id: number }) => n.id === editingId).text) as string | null);
const label = (page: Page, text: string) => page.locator('.node-row', { hasText: text }).first().locator('.node-label');

async function longPress(page: Page, text: string) {
  const box = (await label(page, text).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const pt = [{ x: box.x + 10, y: box.y + box.height / 2, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('tapping a row edits it, and the toolbar shows only while typing', async ({ page }) => {
  const bar = page.locator('#phone-edit-bar');
  await expect(bar).toBeHidden();
  await label(page, 'Second').tap();
  await expect.poll(() => editing(page)).toBe('Second');
  await expect(bar).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await bar.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(vp.height);
  expect(box.width).toBe(vp.width);
  await bar.locator('[data-act="done"]').tap();
  await expect.poll(() => editing(page)).toBe(null);
  await expect(bar).toBeHidden();
});

test('the toolbar indents, outdents, moves and makes a checkbox while the row stays in edit', async ({ page }) => {
  await label(page, 'Second').tap();
  await expect.poll(() => editing(page)).toBe('Second');
  const bar = page.locator('#phone-edit-bar');
  await bar.locator('[data-act="indent"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '1:Second', '0:Third']);
  expect(await editing(page)).toBe('Second');
  await expect(bar).toBeVisible();
  await bar.locator('[data-act="outdent"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '0:Second', '0:Third']);
  await bar.locator('[data-act="up"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:Second', '0:First', '0:Third']);
  await bar.locator('[data-act="down"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '0:Second', '0:Third']);
  await bar.locator('[data-act="checkbox"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '0:[] Second', '0:Third']);
  expect(await editing(page)).toBe('Second');
  // Still typing in the same row: the keyboard's focus never left it.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => document.activeElement === getEditingInput())).toBe(true);
  // And it can all be undone, as on the desktop.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => undoStack.length)).toBeGreaterThanOrEqual(5);
});

test('a long-press opens the row menu; its actions work; a plain tap does not open it', async ({ page }) => {
  const menu = page.locator('#phone-row-menu');
  await label(page, 'Third').tap();
  await expect(menu).toBeHidden();
  await page.locator('#phone-edit-bar [data-act="done"]').tap();

  await longPress(page, 'Second');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.prm-title')).toHaveText('Second');
  // The finger lifting doesn't also start typing in the row.
  expect(await editing(page)).toBe(null);
  await menu.locator('[data-act="h2"]').tap();
  await expect(menu).toBeHidden();
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[1].styles.heading)).toBe(2);

  await longPress(page, 'Second');
  await menu.locator('[data-act="checkbox"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '0:[] Second', '0:Third']);

  await longPress(page, 'First');
  await menu.locator('[data-act="below"]').tap();
  await expect.poll(() => rows(page)).toEqual(['0:First', '0:', '0:[] Second', '0:Third']);
  await expect.poll(() => editing(page)).toBe('');

  await page.locator('#phone-edit-bar [data-act="done"]').tap();
  await longPress(page, 'Third');
  await menu.locator('[data-act="delete"]').tap();
  await expect(page.locator('#editor-pane')).not.toContainText('Third');

  // A tap beside the sheet closes it without doing anything.
  await longPress(page, 'First');
  await expect(menu).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();
});

test('the desktop right-click menu never opens on a phone', async ({ page }) => {
  await label(page, 'First').dispatchEvent('contextmenu', { bubbles: true, cancelable: true });
  // showContextMenu creates #context-menu when it opens.
  await expect(page.locator('#context-menu')).toBeHidden();
});
