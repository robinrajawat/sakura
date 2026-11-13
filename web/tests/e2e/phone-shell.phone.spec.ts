import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 1: the phone layout's shell. The editor fills the screen, the rail and
// the File Explorer are one ☰ drawer, and Settings, Help and To-Dos open full screen.
const row = (id: number, text: string, extra = {}) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {}, ...extra });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(([a, b]) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    localStorage.setItem('sakura_doc_v1_one', JSON.stringify({ nodes: [a], nextId: 2, collapsed: [], title: 'First' }));
    localStorage.setItem('sakura_doc_v1_two', JSON.stringify({ nodes: [b], nextId: 2, collapsed: [], title: 'Second' }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'one', title: 'First', updatedAt: 2 }, { id: 'two', title: 'Second', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'one');
  }, [row(1, 'A row in the first document with enough words to wrap on a small phone screen'), row(1, 'Only in the second')]);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
});

const onScreen = (page: Page, sel: string) => page.locator(sel).evaluate((e) => {
  const r = e.getBoundingClientRect();
  return r.right > 1 && r.left < window.innerWidth - 1 && getComputedStyle(e).visibility !== 'hidden';
});

test('the document fills the screen, with no sideways scrolling, even at 360px', async ({ page }) => {
  await expect(page.locator('#editor-pane')).toContainText('A row in the first document');
  expect(await onScreen(page, '#sidebar')).toBe(false);
  expect(await onScreen(page, '#appbar')).toBe(false);
  await expect(page.locator('#statusbar')).toBeHidden();
  for (const width of [360, page.viewportSize()!.width]) {
    await page.setViewportSize({ width, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const pane = await page.locator('#editor-pane').boundingBox();
    expect(pane!.width).toBeGreaterThanOrEqual(width - 1);
  }
});

test('☰ opens the drawer; the backdrop and Escape close it; the desktop sidebar setting is untouched', async ({ page }) => {
  const before = await page.evaluate(() => localStorage.getItem('sakura_sidebar_open'));
  const menu = page.locator('#phone-menu-btn');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => onScreen(page, '#sidebar')).toBe(true);
  await expect.poll(() => onScreen(page, '#appbar')).toBe(true);
  // A tap beside the drawer closes it.
  const vw = page.viewportSize()!.width;
  await page.mouse.click(vw - 10, 400);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => onScreen(page, '#sidebar')).toBe(false);
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  // The rail's Documents button closes it too.
  await menu.click();
  await page.locator('#rail-docs-btn').click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => localStorage.getItem('sakura_sidebar_open'))).toBe(before);
});

test('opening a document from the drawer shows it and closes the drawer', async ({ page }) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#sidebar').getByText('Second', { exact: true }).click();
  await expect(page.locator('#editor-pane')).toContainText('Only in the second');
  await expect(page.locator('#phone-menu-btn')).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => onScreen(page, '#sidebar')).toBe(false);
});

test('Settings opens full screen without the desktop-only categories, and the drawer closes', async ({ page }) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#rail-settings-btn').click();
  const panel = page.locator('#settings-panel');
  await expect(panel).toHaveClass(/open/);
  await expect(page.locator('#phone-menu-btn')).toHaveAttribute('aria-expanded', 'false');
  const box = await panel.boundingBox();
  const vp = page.viewportSize()!;
  expect(box).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  for (const cat of ['ai', 'shortcuts', 'data']) await expect(page.locator(`#settings-rail .settings-rail-btn[data-cat="${cat}"]`)).toBeHidden();
  for (const cat of ['general', 'documents', 'about']) await expect(page.locator(`#settings-rail .settings-rail-btn[data-cat="${cat}"]`)).toBeVisible();
});

test('search does not offer settings a phone hides', async ({ page }) => {
  // Encrypt keys at rest is an AI setting.
  await page.locator('#phone-menu-btn').click();
  await page.locator('#appbar-qa-slot').click();
  await page.keyboard.type('encrypt keys');
  await expect(page.locator('#qa-dropdown')).not.toContainText('Encrypt keys at rest');
});

test('Help opens full screen, without the tour or the shortcut sheet', async ({ page }) => {
  await page.locator('#doc-help-btn').click();
  const panel = page.locator('#help-panel');
  await expect(panel).toHaveClass(/open/);
  const vp = page.viewportSize()!;
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  await expect(page.locator('#help-tour-replay-row')).toBeHidden();
  await expect(page.locator('#help-cheatsheet-row')).toBeHidden();
  await expect(page.locator('#help-demo-row')).toBeHidden();
});

test('search does not offer the tour, demo or shortcut sheet a phone hides', async ({ page }) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#appbar-qa-slot').click();
  await page.keyboard.type('demo');
  await expect(page.locator('#qa-dropdown')).not.toContainText('Watch a demo');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('tour');
  await expect(page.locator('#qa-dropdown')).not.toContainText('Take the tour');
});

test('a first visit on a phone skips the desktop welcome (tour and demo)', async ({ browser }) => {
  // A fresh profile: nothing seen, no documents (this file's own setup marks the welcome seen).
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => sessionStorage.setItem('sakura_landing_dismissed', 'true'));
  await p.goto('file://' + indexPath);
  await p.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await p.waitForTimeout(900);
  await expect(p.locator('#welcome-overlay')).not.toHaveClass(/open/);
  await ctx.close();
});

test('To-Dos opens full screen with a back button', async ({ page }) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#dock-panel-appbar-toggle').click();
  const panel = page.locator('#todos-panel');
  await expect(panel).toHaveClass(/open/);
  const vp = page.viewportSize()!;
  expect(await panel.boundingBox()).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  await page.locator('#todos-phone-back').click();
  await expect(panel).not.toHaveClass(/open/);
  await expect(page.locator('#editor-pane')).toBeVisible();
});

test('the account menu is a sheet along the bottom', async ({ page }) => {
  await page.locator('#phone-menu-btn').click();
  await page.locator('#account-toggle').click();
  const menu = page.locator('#account-menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBe(8);
  expect(Math.round(box.x + box.width)).toBe(vp.width - 8);
  expect(Math.round(box.y + box.height)).toBe(vp.height - 8);
});
