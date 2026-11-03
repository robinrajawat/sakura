import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-03: Import (.opml) was only on the File Explorer's right-click. The header now has
// one + whose menu holds New document, New folder and Import; a dropped .opml file imports too.
const OPML = '<?xml version="1.0"?><opml version="2.0"><head><title>Dropped</title></head><body><outline text="Alpha"><outline text="Beta"/></outline></body></opml>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { setSidebarOpen(true); ensureDocumentForEditing(); });
});

// The open document's id: a new document (made or imported) becomes the open one.
const openDoc = (page: import('@playwright/test').Page) =>
  // @ts-expect-error -- bare global from index.html
  page.evaluate(() => currentDocId);

test('+ opens New document / New folder / Import; New document is highlighted, so Enter makes one', async ({ page }) => {
  const before = await openDoc(page);
  await page.locator('#sb-new-btn').click();
  const menu = page.locator('#sb-new-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sb-context-item')).toHaveText(['New document', 'New folder', 'Import (.opml)…']);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect.poll(() => openDoc(page)).not.toBe(before);
});

test('+ → New folder makes a folder; + → Import opens the OPML file picker', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  const folders = () => page.evaluate(() => loadFolders().length);
  const f0 = await folders();
  await page.locator('#sb-new-btn').click();
  await page.locator('#sb-new-menu .sb-context-item', { hasText: 'New folder' }).click();
  await expect.poll(folders).toBe(f0 + 1);
  await page.keyboard.press('Escape');
  await page.locator('#sb-new-btn').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#sb-new-menu .sb-context-item', { hasText: 'Import' }).click();
  await chooser;
});

test('a .opml file dropped on the File Explorer becomes a new document', async ({ page }) => {
  const before = await openDoc(page);
  await page.evaluate((xml) => {
    const dt = new DataTransfer();
    dt.items.add(new File([xml], 'dropped.opml', { type: 'text/x-opml' }));
    const target = document.getElementById('sidebar')!;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, OPML);
  await expect.poll(() => openDoc(page)).not.toBe(before);
  // @ts-expect-error -- bare global from index.html
  await expect.poll(() => page.evaluate(() => nodes.map((n: { text: string }) => n.text))).toEqual(['Alpha', 'Beta']);
});

test('the + lines up with the folder counts on the right (owner, 2026-11-03)', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { saveFolders([{ id: 'fa', name: 'Projects', open: false, parentId: null }]); const m = loadDocFolderMap(); m[currentDocId] = 'fa'; localStorage.setItem('sakura_doc_folder_v1', JSON.stringify(m)); renderSidebar(); });
  const r = await page.evaluate(() => ({
    plus: document.querySelector('#sb-new-btn svg')!.getBoundingClientRect().right,
    count: document.querySelector('.sfolder-count')!.getBoundingClientRect().right
  }));
  expect(Math.abs(r.plus - r.count)).toBeLessThanOrEqual(1);
});

test('the + menu uses plain icons; an empty Unfiled heading shows only while a document is dragged', async ({ page }) => {
  await page.locator('#sb-new-btn').click();
  const icons = await page.locator('#sb-new-menu .sb-context-item svg').evaluateAll((els) => els.map((e) => e.innerHTML));
  expect(icons[0]).not.toContain('<line'); // New document: a page, no plus
  expect(icons[1]).not.toContain('<line'); // New folder: a folder, no plus
  await page.keyboard.press('Escape');
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { saveFolders([{ id: 'fa', name: 'Projects', open: false, parentId: null }]); const m = loadDocFolderMap(); m[currentDocId] = 'fa'; localStorage.setItem('sakura_doc_folder_v1', JSON.stringify(m)); renderSidebar(); });
  const unfiled = page.locator('.sb-unfiled-row');
  await expect(unfiled).toHaveCount(1);
  await expect(unfiled).toBeHidden();
  await page.evaluate(() => document.getElementById('sidebar')!.classList.add('sb-doc-drag-active'));
  await expect(unfiled).toBeVisible();
});
