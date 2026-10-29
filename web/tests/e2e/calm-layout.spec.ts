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
// Clicking one takes you to the document in the explorer, not just to the folder.
test('the top line shows the folders, not the document name; a folder there shows the document in the explorer', async ({ page }) => {
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
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { const fs = loadFolders(); fs.find((f: any) => f.id === 'f1').open = false; saveFolders(fs); renderSidebar(); });
  await page.locator('.doc-path-folder').click();
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(true);
  await expect(page.locator('.sdoc-item.active')).toBeInViewport();
  await expect(page.locator('.sdoc-item.active')).toContainText('Plan');
});

// Opening Documents points at the open document (owner 2026-10-29): only the folders it sits in
// unfold, its row (already marked as current) is in view, and a search in the panel is left alone.
test('opening Documents reveals the open document, unfolding only its folders', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setSidebarOpen(false); ensureDocumentForEditing(); el('header-title').value = 'Plan'; el('header-title').dispatchEvent(new Event('input')); saveToStorage();
    // @ts-expect-error
    saveFolders([{ id: 'f1', name: 'Work', parentId: null, open: false }, { id: 'f2', name: 'Q4', parentId: 'f1', open: false }, { id: 'f3', name: 'Other', parentId: null, open: false }]);
    // @ts-expect-error
    const m = loadDocFolderMap(); m[currentDocId] = 'f2'; saveDocFolderMap(m); renderSidebar();
  });
  await page.locator('#rail-docs-btn').click();
  const row = page.locator('.sdoc-item.active');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Plan');
  await expect(row).toBeInViewport();
  // @ts-expect-error -- bare globals from index.html
  const open = await page.evaluate(() => Object.fromEntries(loadFolders().map((f: any) => [f.id, f.open !== false])));
  expect(open).toEqual({ f1: true, f2: true, f3: false });
  // Clicking it again closes the panel.
  await page.locator('#rail-docs-btn').click();
  // @ts-expect-error
  expect(await page.evaluate(() => sidebarOpen)).toBe(false);
});

// Settings, grouped (owner 2026-10-29: fewer boxes, but a standard look): one card per group under a
// sentence-case heading, no rule under the heading, and the actions look like buttons.
test('Settings: sentence-case headings, one card per group, real buttons', async ({ page }) => {
  await page.locator('#rail-settings-btn').click();
  await page.locator('#settings-panel .settings-rail-btn[data-cat="data"]').click();
  const s = await page.evaluate(() => {
    const title = document.querySelector('#settings-panel .settings-section[data-cat="data"] .settings-section-title')!;
    const list = title.parentElement!.querySelector('.settings-list')!;
    const btn = document.getElementById('sb-export-all-btn')!;
    return {
      transform: getComputedStyle(title).textTransform, rule: getComputedStyle(title).borderBottomStyle,
      radius: getComputedStyle(list).borderTopLeftRadius, btnBorder: getComputedStyle(btn).borderTopColor,
      width: Math.round(document.getElementById('settings-panel')!.getBoundingClientRect().width)
    };
  });
  expect(s.transform).toBe('none');
  expect(s.rule).toBe('none');
  expect(s.radius).toBe('10px');
  expect(s.btnBorder).not.toBe('rgba(0, 0, 0, 0)');
  expect(s.width).toBeGreaterThan(700);
});
