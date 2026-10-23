import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Undoable actions just happen and offer Undo in the toast; a dialog is left only where nothing
// can bring it back (owner, 2026-10-23: unified UI). Clear all nodes is in toolbar-settings-simplify.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval(`ensureDocumentForEditing();
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    nodes = [n(1, 0, 'Alpha')].map(normalizeNode); rebuildParentIds(); nextId = 2; undoStack = []; render();`));
});
const ev = (page: import('@playwright/test').Page, js: string) => page.evaluate((js) => (window as any).eval(js), js);
const undoBtn = (page: import('@playwright/test').Page) => page.locator('#toast button', { hasText: 'Undo' });

test('deleting a folder needs no dialog; Undo puts it and its documents back', async ({ page }) => {
  await ev(page, `saveFolders([{ id: 'f1', name: 'Work', parentId: null }]); setFolderForDoc(currentDocId, 'f1'); renderSidebar(); window.__del = deleteFolderById('f1'); 0`);
  await ev(page, 'window.__del');
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  expect(await ev(page, 'loadFolders().length')).toBe(0);
  await undoBtn(page).click();
  expect(await ev(page, '[loadFolders().length, getFolderForDoc(currentDocId)]')).toEqual([1, 'f1']);
});

test('restoring a row\'s text from history needs no dialog; Undo takes it back', async ({ page }) => {
  await ev(page, `window.__r = restoreNodeTextFromRevision(1, 'Older Alpha'); 0`);
  await ev(page, 'window.__r');
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  expect(await ev(page, 'nodes[0].text')).toBe('Older Alpha');
  await undoBtn(page).click();
  expect(await ev(page, 'nodes[0].text')).toBe('Alpha');
});

test('Reset all shortcuts needs no dialog; Undo brings your bindings back', async ({ page }) => {
  await ev(page, `shortcutOverrides = { findInTree: 'mod+j' }; saveShortcutOverrides(); el('shortcuts-reset-all-btn').click(); 0`);
  await expect(page.locator('#sakura-modal-overlay')).not.toHaveClass(/open/);
  expect(await ev(page, 'JSON.stringify(shortcutOverrides)')).toBe('{}');
  await undoBtn(page).click();
  expect(await ev(page, 'shortcutOverrides.findInTree')).toBe('mod+j');
});
