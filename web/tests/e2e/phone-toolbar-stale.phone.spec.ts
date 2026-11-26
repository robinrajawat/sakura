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

// Owner 2026-11-26: closing the iPhone keyboard and then tapping Done didn't work. Closing the
// keyboard now counts as Done. A stand-in visualViewport lets the test open and close a keyboard.
test.describe('closing the keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const vv = new EventTarget() as EventTarget & { height: number; offsetTop: number; width: number; offsetLeft: number; scale: number };
      vv.height = window.innerHeight; vv.offsetTop = 0; vv.width = window.innerWidth; vv.offsetLeft = 0; vv.scale = 1;
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      (window as any).__setKeyboard = (px: number) => { vv.height = window.innerHeight - px; vv.dispatchEvent(new Event('resize')); };
    });
    await page.reload();
    await page.waitForFunction(() => typeof (window as any).render === 'function');
  });

  test('saves the row and hides the toolbar, as Done does', async ({ page }) => {
    const bar = page.locator('#phone-edit-bar');
    await page.locator('.node-row', { hasText: 'Second' }).first().locator('.node-label').tap();
    await page.evaluate(() => (window as any).__setKeyboard(300));
    await expect(bar).toBeVisible();
    expect(Math.round((await bar.boundingBox())!.y + (await bar.boundingBox())!.height)).toBe(page.viewportSize()!.height - 300);
    await page.keyboard.press('End');
    await page.keyboard.type(' edited');
    await page.evaluate(() => (window as any).__setKeyboard(0));
    await expect(bar).toBeHidden();
    expect(await page.evaluate(() => (window as any).eval('editingId'))).toBe(null);
    expect(await page.evaluate(() => (window as any).eval('nodes[1].text'))).toBe('Second edited');
    // Tapping a row again brings the toolbar back.
    await page.locator('.node-row', { hasText: 'First' }).first().locator('.node-label').tap();
    await page.evaluate(() => (window as any).__setKeyboard(300));
    await expect(bar).toBeVisible();
  });

  test('a small change in the visible height (no keyboard) does not end editing', async ({ page }) => {
    const bar = page.locator('#phone-edit-bar');
    await page.locator('.node-row', { hasText: 'Second' }).first().locator('.node-label').tap();
    await expect(bar).toBeVisible();
    await page.evaluate(() => (window as any).__setKeyboard(20));
    await page.evaluate(() => (window as any).__setKeyboard(0));
    await expect(bar).toBeVisible();
  });
});
