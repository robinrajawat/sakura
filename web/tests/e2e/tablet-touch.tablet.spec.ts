import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { touchGesture } from './fixtures/touch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-22, on an iPad: the password box stayed under the on-screen keyboard, and the app
// "got misaligned" (Safari zooms in on a field under 16px and leaves the page zoomed and shifted).
// A tablet gets the computer layout (it is wider than 768px) but has a finger and an on-screen
// keyboard: src/styles/index/touch.css and index.html's touch wiring (docs/mobile-plan.md, "Touch and
// the on-screen keyboard"). Runs as tablet-ios (WebKit, iPad) and tablet-android (Chromium).

const ROWS = [
  { id: 1, depth: 0, text: 'First row', parentId: null },
  { id: 2, depth: 0, text: 'Second row', parentId: null }
].map((n) => ({ isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...n }));

async function open(page: Page, { landing = false } = {}) {
  await page.addInitScript(({ rows, landing }) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    if (!landing) sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_doc_v1_ab', JSON.stringify({ nodes: rows, nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Tablet check' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'ab', title: 'Tablet check', updatedAt: 1767225600000 }]));
    localStorage.setItem('sakura_current_doc_v1', 'ab');
  }, { rows: ROWS, landing });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
}

test('a tablet gets the computer layout with the touch rules', async ({ page }) => {
  await open(page);
  const state = await page.evaluate(() => ({
    phone: document.documentElement.classList.contains('phone'),
    touch: matchMedia('screen and (hover: none) and (pointer: coarse)').matches
  }));
  expect(state).toEqual({ phone: false, touch: true });
});

test('the password box is 16px, and above the keyboard once it opens', async ({ page }) => {
  await open(page, { landing: true });
  await expect(page.locator('#sakura-landing-overlay')).toBeVisible();
  await page.locator('#sakura-landing-email-toggle-btn').tap();
  const pw = page.locator('#sakura-landing-password-input');
  await expect(pw).toBeVisible();
  expect(await pw.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  // No real keyboard in a test browser: stand in for one covering 60% of the screen, as an iPad's
  // does in landscape, the way the visualViewport wiring would set it.
  const kb = await page.evaluate(() => {
    const h = Math.round(window.innerHeight * 0.6);
    document.documentElement.style.setProperty('--kb-inset', h + 'px');
    return h;
  });
  await pw.focus();
  await expect.poll(async () => pw.evaluate((e, kb) => e.getBoundingClientRect().bottom <= window.innerHeight - kb, kb)).toBe(true);
  // The overlay ends above the keyboard, so nothing of it sits underneath.
  const ovBottom = await page.locator('#sakura-landing-overlay').evaluate((e) => e.getBoundingClientRect().bottom);
  expect(Math.round(ovBottom)).toBe(await page.evaluate(() => window.innerHeight) - kb);
});

test('rows and their editor are 16px, so tapping one does not zoom the page', async ({ page }) => {
  await open(page);
  const label = page.locator('.node-row .node-label', { hasText: 'Second row' });
  expect(await label.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  await label.tap();
  const input = page.locator('.node-row .node-input');
  await expect(input).toBeVisible();
  expect(await input.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
});

test('a long-press on a row opens its right-click menu, and the lift is not a tap', async ({ page }) => {
  await open(page);
  const box = (await page.locator('.node-row .node-label', { hasText: 'First row' }).boundingBox())!;
  const at = { x: box.x + 20, y: box.y + box.height / 2 };
  await touchGesture(page, [[at]], 700);
  await expect(page.locator('#context-menu')).toBeVisible();
  // The row was not opened for typing by the finger lifting.
  await expect(page.locator('.node-row .node-input')).toHaveCount(0);
});

test('a task’s ⋯ shows without hovering', async ({ page }) => {
  // Seeded before load: reloading a file:// page can lose localStorage under Playwright.
  await page.addInitScript(() => {
    localStorage.setItem('sakura_todos_v1', JSON.stringify([{ id: 't1', text: 'Call Sam', done: false, createdAt: 1767225600000 }]));
  });
  await open(page);
  await page.locator('#dock-panel-appbar-toggle').tap();
  const more = page.locator('#todos-body .todo-more-btn').first();
  await expect(more).toBeVisible();
  expect(await more.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
});
