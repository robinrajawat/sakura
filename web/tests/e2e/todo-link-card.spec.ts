import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// A task's link uses the same one-line card as a link in the text (owner, 2026-10-23: one link
// editor everywhere): one field takes a web address, or words to find a document or row.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: Page, todos: object[]) {
  await page.addInitScript((t) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_todos_v1', JSON.stringify(t));
  }, todos.map((t) => ({ createdAt: Date.now(), done: false, subtasks: [], ...t })));
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    (window as any).eval(`ensureDocumentForEditing(); nodes=[normalizeNode({id:1,depth:0,text:'Pallet labels',parentId:null,isCheckbox:false,checked:false,note:'',tags:[],styles:{}})]; nextId=2; render();`);
  });
  await page.keyboard.press('Control+Shift+T');
  await page.waitForSelector('#todos-panel:not([style*="display: none"])');
}
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('sakura_todos_v1') || '[]')[0]);
async function menu(page: Page, item: string) {
  await page.locator('.todo-row[data-id="a"]').click({ button: 'right', position: { x: 4, y: 10 } });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: item }).click();
}

test('Link… takes a typed web address; Change link… shows Open and Remove', async ({ page }) => {
  await open(page, [{ id: 'a', text: 'Check the ticket' }]);
  await menu(page, 'Link…');
  const pop = page.locator('#todo-link-popover');
  await expect(pop).toHaveClass(/open/);
  await expect(pop.locator('input')).toHaveCount(1);
  await expect(page.locator('#link-pop-remove-btn')).toBeHidden();
  await expect(page.locator('#link-pop-input')).toBeFocused();
  await page.keyboard.type('example.com/browse/T-1');
  await expect(page.locator('#link-pop-node-results')).toBeEmpty();
  await page.keyboard.press('Enter');
  await expect(pop).not.toHaveClass(/open/);
  expect((await stored(page)).link).toBe('https://example.com/browse/T-1');

  await menu(page, 'Change link…');
  await expect(page.locator('#link-pop-input')).toHaveValue('https://example.com/browse/T-1');
  await expect(page.locator('#link-pop-open-btn')).toBeVisible();
  await page.locator('#link-pop-remove-btn').click();
  expect((await stored(page)).link).toBeFalsy();
});

test('typing words finds a row; Enter links the first match', async ({ page }) => {
  await open(page, [{ id: 'a', text: 'Check labels' }]);
  await menu(page, 'Link…');
  await expect(page.locator('#link-pop-input')).toBeFocused();
  await page.keyboard.type('Pallet');
  await expect(page.locator('#link-pop-node-results .link-pop-node-item').first()).toBeVisible();
  await page.keyboard.press('Enter');
  const t = await stored(page);
  expect(t.nodeRef).toBeTruthy();
  expect(t.link).toBeFalsy();
});

test('a name given to an address stays while the address is unchanged', async ({ page }) => {
  await open(page, [{ id: 'a', text: 'Check the ticket', link: 'https://example.com/T-2', linkLabel: 'T-2' }]);
  await menu(page, 'Change link…');
  await expect(page.locator('#link-pop-input')).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await stored(page)).linkLabel).toBe('T-2');
  await menu(page, 'Change link…');
  await page.locator('#link-pop-input').fill('https://example.com/T-3');
  await page.keyboard.press('Enter');
  const t = await stored(page);
  expect(t.link).toBe('https://example.com/T-3');
  expect(t.linkLabel).toBeFalsy();
});
