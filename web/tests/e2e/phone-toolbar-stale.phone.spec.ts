import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-26 (iPhone): "sometimes" the row toolbar stays after Done. The toolbar was shown and
// hidden only on focusin/focusout, and a redraw (a sync, an autosave) that removes the row being
// typed in sends no focus event, in Safari or Chrome. The toolbar then stayed with nothing being
// edited, and Done did nothing because no row was being edited.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, depth: number, text: string) =>
      ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    localStorage.setItem('sakura_doc_v1_e', JSON.stringify({ nodes: [n(1, 0, 'First'), n(2, 0, 'Second')], nextId: 3, collapsed: [], title: 'Edit' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'e', title: 'Edit', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'e');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Second');
});

test('editing that ends without a focus event (a redraw) hides the toolbar', async ({ page }) => {
  const bar = page.locator('#phone-edit-bar');
  await page.locator('.node-row', { hasText: 'Second' }).first().locator('.node-label').tap();
  await expect(bar).toBeVisible();
  // Safari sends no focus event when the focused row is removed; Chromium does. Stop them reaching
  // the app so this checks the Safari case.
  await page.evaluate(() => ['focusin', 'focusout'].forEach((t) => window.addEventListener(t, (e) => e.stopPropagation(), true)));
  // What a sync or another redraw does: editing ends and the row being typed in is replaced.
  await page.evaluate(() => (window as any).eval('editingId = null; render();'));
  await expect(bar).toBeHidden();
});

test('Done hides the toolbar even when no row is being edited any more', async ({ page }) => {
  const bar = page.locator('#phone-edit-bar');
  await page.locator('.node-row', { hasText: 'Second' }).first().locator('.node-label').tap();
  await expect(bar).toBeVisible();
  // Force the stale state the owner saw: the bar up, nothing being edited.
  await page.evaluate(() => (window as any).eval('editingId = null; document.getElementById("phone-edit-bar").hidden = false;'));
  await bar.locator('[data-act="done"]').tap();
  await expect(bar).toBeHidden();
});
