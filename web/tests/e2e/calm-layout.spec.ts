import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The layout (owner 2026-10-28: tried as "Calm", now the only one): the app bar is a left rail, there
// is no toolbar row or status bar, History and Share sit on the top line, open items under the title,
// and everything the rail opens sits beside it.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

test('one layout: no switch, a rail on the left, no toolbar row or status bar', async ({ page }) => {
  await expect(page.locator('html')).toHaveClass(/calm-layout/);
  await expect(page.locator('#layout-segmented')).toHaveCount(0);
  const m = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    return {
      rail: r('appbar'), share: r('doc-share-chip'), title: r('header-title'),
      wordcount: getComputedStyle(document.getElementById('sb-wordcount')!).display,
      undo: document.getElementById('undo-btn'),
      onTopLine: document.getElementById('doc-tab-strip-row')!.contains(document.getElementById('quick-bar')),
      marksUnderTitle: document.getElementById('editor-meta-row')!.contains(document.getElementById('ag-markers'))
    };
  });
  expect(m.rail.width).toBeLessThan(60);
  expect(m.rail.height).toBeGreaterThan(400);
  expect(m.wordcount).toBe('none');
  expect(m.undo).toBeNull();
  expect(m.onTopLine).toBe(true);
  expect(m.marksUnderTitle).toBe(true);
  expect(m.share.bottom).toBeLessThan(m.title.top);
});

test('the rail: Documents and To-Dos share the slot beside it; Settings opens from its gear', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setSidebarOpen(false);
  });
  await page.locator('#rail-docs-btn').click();
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(true);
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(false);
  const todos = await page.locator('#todos-panel').boundingBox();
  expect(todos!.x).toBeLessThan(60);
  await page.locator('#rail-docs-btn').click();
  await expect(page.locator('#todos-panel')).not.toHaveClass(/open/);
  await page.locator('#rail-settings-btn').click();
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
});

test('the top line is always there; Export is under Share', async ({ page }) => {
  await expect(page.locator('#doc-tab-strip-row')).toBeVisible();
  await expect(page.locator('#appbar-more-toggle')).toHaveCount(0);
  await page.locator('#doc-share-chip').click();
  await expect(page.locator('#share-menu .sb-context-item[data-save="opml"]')).toBeVisible();
});

// No tabs (owner 2026-10-28): the top line shows Folder › Document; back/forward are shortcuts only
// (owner 2026-10-29); Search opens with recent documents.
test('no tabs: path on the top line, back/forward between documents, recent documents in Search', async ({ page }) => {
  await expect(page.locator('#doc-tab-strip')).toBeHidden();
  const first = await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    ensureDocumentForEditing(); el('header-title').value = 'First'; el('header-title').dispatchEvent(new Event('input')); saveToStorage(); return currentDocId;
  });
  await expect(page.locator('#doc-nav-back')).toHaveCount(0);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    createDoc(); el('header-title').value = 'Second'; el('header-title').dispatchEvent(new Event('input')); saveToStorage();
  });
  await page.keyboard.press('ControlOrMeta+BracketLeft');
  // @ts-expect-error -- bare globals from index.html
  await expect.poll(() => page.evaluate(() => currentDocId)).toBe(first);
  await page.locator('#qa-category-icon-btn').click();
  await expect(page.locator('.qa-item', { hasText: 'Second' }).first()).toBeVisible();
});

// Fewer Documents buttons (owner 2026-10-29): the header keeps New folder and New document; Import
// and Collapse all folders are on the explorer's right-click; clicking the document name locates it.
test('the File Explorer header has two buttons; its right-click has Import', async ({ page }) => {
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { setSidebarOpen(true); ensureDocumentForEditing(); });
  const ids = await page.locator('.sb-section-actions .sb-icon-btn').evaluateAll((els) => els.map((e) => e.id));
  expect(ids).toEqual(['sb-new-folder-btn', 'sb-new-doc-btn']);
  await page.locator('#sidebar').click({ button: 'right', position: { x: 60, y: 400 } });
  const labels = await page.locator('.sb-context-menu .sb-context-item').allTextContents();
  expect(labels.slice(0, 3)).toEqual(['New document', 'New folder', 'Import (.opml)…']);
  await page.keyboard.press('Escape');
});

// The title sits right below the top line, so the top line names only the folders (owner 2026-10-29).
test('the top line shows the folders, not the document name; a folder there opens the explorer', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setSidebarOpen(false); ensureDocumentForEditing(); el('header-title').value = 'Plan'; el('header-title').dispatchEvent(new Event('input')); saveToStorage(); renderDocPath();
  });
  await expect(page.locator('#doc-path-crumbs')).toHaveText('');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    const fs = loadFolders(); fs.push({ id: 'f1', name: 'Work', parentId: null }); saveFolders(fs); const m = loadDocFolderMap(); m[currentDocId] = 'f1'; saveDocFolderMap(m); renderDocPath();
  });
  await expect(page.locator('#doc-path-crumbs')).toHaveText('Work');
  await page.locator('.doc-path-folder').click();
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(true);
});
