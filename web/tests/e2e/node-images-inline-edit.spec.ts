import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Quick image edits happen in place: the caption is edited right under its thumbnail, and size is a
// submenu on the thumbnail's right-click menu. The viewer is for viewing large and Mark up.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const svg = (c: string) => 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="${c}"/></svg>`);
      const docId = 'imginline';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {},
          images: [{ id: 'a', src: svg('#9ab'), caption: 'Login page', annotations: [], createdAt: 1 }, { id: 'b', src: svg('#ab9'), caption: '', annotations: [], createdAt: 2 }] }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Images', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Images', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  });
});

async function load(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForSelector('.node-image-thumb');
  return errors;
}
// @ts-expect-error -- bare global from index.html
const images = (page: import('@playwright/test').Page) => page.evaluate(() => nodes[0].images.map((i: any) => ({ caption: i.caption, width: i.width ?? null })));

test('clicking a caption edits it in place; Enter saves (one undo step), Esc cancels', async ({ page }) => {
  const errors = await load(page);
  await page.locator('.node-image-caption').first().click();
  const input = page.locator('.node-image-caption-input');
  await expect(input).toBeFocused();
  await expect(page.locator('#node-image-viewer.open')).toHaveCount(0); // no popup
  await page.keyboard.press('End');
  await page.keyboard.type(' v2');
  await page.keyboard.press('Enter');
  expect((await images(page))[0].caption).toBe('Login page v2');

  await page.locator('.node-image-caption').first().click();
  await page.keyboard.type('throwaway');
  await page.keyboard.press('Escape');
  expect((await images(page))[0].caption).toBe('Login page v2');

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => undo());
  expect((await images(page))[0].caption).toBe('Login page');
  expect(errors).toEqual([]);
});

test('right-click: Add caption on an uncaptioned image, and Size sets the display width', async ({ page }) => {
  const errors = await load(page);
  const second = page.locator('.node-image-thumb').nth(1);
  await second.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  const labels = await menu.evaluate((m) => [...m.children].map((c) => c.classList.contains('sb-context-divider') ? '---'
    : (c.textContent || '').trim() + (c.classList.contains('disabled') ? ' (off)' : '')));
  expect(labels).toEqual(['Open', 'Copy image', 'Download', '---', 'Add caption', 'Size', 'Mark up…', '---', 'Move left', 'Move right (off)', '---', 'Delete image']);
  await menu.getByText('Add caption', { exact: true }).click();
  await page.keyboard.type('Dashboard');
  await page.keyboard.press('Enter');
  expect((await images(page))[1].caption).toBe('Dashboard');

  await page.locator('.node-image-thumb').nth(1).click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Size', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Medium', { exact: true }).click();
  expect((await images(page))[1].width).toBe(60);
  expect(errors).toEqual([]);
});

test('Mark up… opens the viewer straight in marking mode', async ({ page }) => {
  const errors = await load(page);
  await page.locator('.node-image-thumb').first().click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Mark up…', { exact: true }).click();
  await expect(page.locator('#node-image-viewer .niv-markup-toggle.active')).toBeVisible();
  expect(errors).toEqual([]);
});
