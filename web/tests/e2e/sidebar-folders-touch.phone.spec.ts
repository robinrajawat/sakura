// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const indexPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../index.html');

// Owner 2026-11-25, iPhone Safari: closing one folder closed another. The only target was an
// 18px arrow and Safari moves a tap that misses it to the nearest one. The whole row is the target
// now, and on a touch screen it is finger-sized.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof renderSidebar === "function"');
  await page.evaluate(() => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    ensureDocumentForEditing();
    saveFolders([{ id: 'fa', name: 'Alpha', open: true }, { id: 'fc', name: 'Child', parentId: 'fa', open: true }, { id: 'fb', name: 'Beta', open: true }]);
    const m = loadDocFolderMap(); m[currentDocId] = 'fc'; saveDocFolderMap(m);
    renderSidebar();
  });
  await page.locator('#phone-menu-btn').click();
});

const openState = (page) => page.evaluate(() => Object.fromEntries(loadFolders().map((f) => [f.name, f.open !== false])));

test('tapping a folder row opens and closes that folder only', async ({ page }) => {
  const row = (id) => page.locator(`.sfolder-row[data-folder-id="${id}"]`);
  await expect(row('fb')).toBeVisible();
  for (const id of ['fa', 'fc', 'fb']) expect((await row(id).boundingBox()).height).toBeGreaterThanOrEqual(40);

  await row('fc').locator('.sfolder-name').tap();
  expect(await openState(page)).toEqual({ Alpha: true, Child: false, Beta: true });
  await row('fb').locator('.sfolder-name').tap();
  expect(await openState(page)).toEqual({ Alpha: true, Child: false, Beta: false });
  // The arrow still works, once (not twice through the row).
  await row('fb').locator('.sfolder-toggle').tap();
  expect(await openState(page)).toEqual({ Alpha: true, Child: false, Beta: true });
  await row('fa').locator('.sfolder-name').tap();
  expect(await openState(page)).toEqual({ Alpha: false, Child: false, Beta: true });
});
