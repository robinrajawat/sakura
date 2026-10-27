import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Spelling (owner, 2026-10-27): a page can't add the browser's spelling suggestions to its own menu,
// so right-clicking a word in the text you're typing in (a note, a thread entry, the reply line) leaves
// the browser's menu alone. Blank space, links, and text you aren't typing in keep Sakura's menu.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
  await page.evaluate(`
    nodes = [normalizeNode({ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: 'Teh note with a <a href="https://example.com">link</a>', tags: [], styles: {} })];
    rebuildParentIds(); nextId = 2;
    remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-27', text: 'Recieved it.', createdAt: 1 }];
    inlineExpandNoteNodeIds = new Set([1]); inlineExpandRemarksNodeIds = new Set([1]);
    collapsedIds = new Set(); editingId = null; undoStack = []; render();
    window.__lastCtx = null;
    window.addEventListener('contextmenu', e => { setTimeout(() => { window.__lastCtx = e.defaultPrevented ? 'sakura' : 'browser'; }, 0); }, true);
  `);
}
const lastMenu = async (page: Page) => { await page.waitForTimeout(20); return page.evaluate('window.__lastCtx'); };
const sakuraMenu = (page: Page) => page.locator('.sb-context-menu');
// Right-clicks the middle of the element's first word (spelling is about words, not blank space).
async function rightClickWord(page: Page, sel: string) {
  const pt = await page.evaluate((s) => {
    const el = document.querySelector(s)!;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const n = w.nextNode() as Text;
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.max(1, n.data.search(/\s|$/)));
    const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, sel);
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
}

test('a note: Sakura menu until you type in it, then the browser menu on its text; a link keeps Sakura', async ({ page }) => {
  await open(page);
  const note = page.locator('#note-line-1');
  await note.click({ button: 'right', position: { x: 8, y: 6 } });
  expect(await lastMenu(page)).toBe('sakura');
  await expect(sakuraMenu(page)).toBeVisible();
  await page.keyboard.press('Escape');

  await note.click({ position: { x: 8, y: 6 } });
  await expect(note).toBeFocused();
  await rightClickWord(page, '#note-line-1');
  expect(await lastMenu(page)).toBe('browser');
  await expect(sakuraMenu(page)).toHaveCount(0);

  await note.locator('a').click({ button: 'right' });
  expect(await lastMenu(page)).toBe('sakura');
});

test('a thread entry and the reply line show the browser menu on their text while typing', async ({ page }) => {
  await open(page);
  const entry = page.locator('#inline-remark-text-c1');
  await entry.click({ button: 'right' });
  expect(await lastMenu(page)).toBe('sakura');
  await page.keyboard.press('Escape');

  await entry.click();
  await expect(entry).toBeFocused();
  await rightClickWord(page, '#inline-remark-text-c1');
  expect(await lastMenu(page)).toBe('browser');
  await expect(sakuraMenu(page)).toHaveCount(0);

  await page.evaluate('openThreadComposer(1,false)');
  const reply = page.locator('.thread-composer-input');
  await expect(reply).toBeFocused();
  await page.keyboard.type('Thier answer');
  await rightClickWord(page, '.thread-composer-input');
  expect(await lastMenu(page)).toBe('browser');
  // Blank space beside the words keeps the line's own menu (Add to thread, Make it a question, Close).
  const box = await reply.boundingBox();
  await reply.click({ button: 'right', position: { x: box!.width - 6, y: 8 } });
  expect(await lastMenu(page)).toBe('sakura');
  await expect(sakuraMenu(page).getByText('Close', { exact: true })).toBeVisible();
});

test('picking from Sakura\'s menu on an entry, then right-clicking it again, still shows Sakura\'s menu', async ({ page }) => {
  await open(page);
  const entry = page.locator('#inline-remark-text-c1');
  await entry.click({ button: 'right' });
  await sakuraMenu(page).getByText('Mark as decision', { exact: true }).click();
  await entry.click({ button: 'right' });
  expect(await lastMenu(page)).toBe('sakura');
  await expect(sakuraMenu(page).getByText('Not a decision', { exact: true })).toBeVisible();
});
