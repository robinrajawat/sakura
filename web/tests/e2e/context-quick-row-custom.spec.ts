import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: import('@playwright/test').Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', 'true'); } catch { /* ignore */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    const n = (id: number, depth: number, text: string, parentId: number | null) =>
      ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [] });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'First', null), n(2, 1, 'Child', 1)]; nextId = 3; collapsedIds = new Set(); render();
  });
}
const quick = (page: import('@playwright/test').Page) =>
  page.evaluate(() => [...document.querySelectorAll('#context-quickbar [data-action]')].map((b) => (b as HTMLElement).dataset.action));

test('quick row: remove via right-click, pin from More, drag to reorder, persist, reset', async ({ page }) => {
  await open(page);
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  expect(await quick(page)).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'image']);

  // Remove "Add image" via its own right-click menu.
  await page.locator('#context-quickbar [data-action="image"]').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Remove from quick row' }).click();
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  expect(await quick(page)).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table']);

  // Pin "Insert date/time" from More.
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-more-panel .context-submenu-trigger[data-flyout="insert"]').hover();
  await page.locator('#context-more-panel .ctx-pin[data-pin="date-time"]').click({ force: true });
  expect(await quick(page)).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'date-time']);
  // The row is now full: pinning another is refused.
  await page.locator('#context-more-panel .context-submenu-trigger[data-flyout="row"]').hover();
  await page.locator('#context-more-panel .ctx-pin[data-pin="tags"]').click({ force: true });
  expect(await quick(page)).toHaveLength(6);

  // Drag Table to the front.
  await page.locator('#context-quickbar [data-action="table"]').dragTo(page.locator('#context-quickbar [data-action="ai-rewrite"]'));
  expect(await quick(page)).toEqual(['table', 'ai-rewrite', 'note', 'remark', 'diagram', 'date-time']);

  // Persists: it's in saved prefs, and a fresh loadPrefs() (what a page load runs) restores it.
  // (Not a page.reload(): under Playwright, reloading a file:// page intermittently lost
  // localStorage with no app code touching it, so the reload itself made this test flaky.)
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}').ctxQuickRow)).toEqual(['table', 'ai-rewrite', 'note', 'remark', 'diagram', 'date-time']);
  // @ts-expect-error
  await page.evaluate(() => { ctxQuickRowCustom = null; loadPrefs(); });
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  expect(await quick(page)).toEqual(['table', 'ai-rewrite', 'note', 'remark', 'diagram', 'date-time']);

  // Reset brings the default back.
  await page.locator('#context-quickbar [data-action="note"]').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Reset quick row' }).click();
  await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
  expect(await quick(page)).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'image']);
});
