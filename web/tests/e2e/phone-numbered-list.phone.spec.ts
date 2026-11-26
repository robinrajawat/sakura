import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { longPressAt } from './fixtures/touch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-26 (iPhone): Numbered list was only in the computer's right-click menu. The phone's
// long-press menu offers it on a row with children, as Numbered list or Bulleted list.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, depth: number, text: string) =>
      ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_e', JSON.stringify({ nodes: [n(1, 0, 'Steps'), n(2, 1, 'Create'), n(3, 1, 'Confirm'), n(4, 0, 'Plain')], nextId: 5, collapsed: [], title: 'Edit' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'e', title: 'Edit', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'e');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Confirm');
});

async function longPress(page: Page, text: string) {
  const box = (await page.locator('.node-row', { hasText: text }).first().locator('.node-label').boundingBox())!;
  await longPressAt(page, { x: box.x + 10, y: box.y + box.height / 2 });
}
const nums = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.node-row')).map((r) => (r.querySelector('.is-num') as HTMLElement | null)?.dataset.num || ''));

test('a long-press offers Numbered list on a row with children, and it toggles', async ({ page }) => {
  const menu = page.locator('#phone-row-menu');
  const item = menu.locator('[data-act="numbered"]');
  await longPress(page, 'Steps');
  await expect(item).toBeVisible();
  await expect(item).toHaveText('Numbered list');
  await item.tap();
  await expect(menu).toBeHidden();
  expect(await nums(page)).toEqual(['', '1.', '2.', '']);
  await longPress(page, 'Steps');
  await expect(item).toHaveText('Bulleted list');
  await item.tap();
  expect(await nums(page)).toEqual(['', '', '', '']);
});

test('a row without children is not offered it', async ({ page }) => {
  await longPress(page, 'Plain');
  await expect(page.locator('#phone-row-menu')).toBeVisible();
  await expect(page.locator('#phone-row-menu [data-act="numbered"]')).toBeHidden();
});
