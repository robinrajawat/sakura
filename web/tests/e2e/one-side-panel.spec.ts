import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none'));
});

// To-Dos, Settings and Help share the slot beside the rail: one at a time. With To-Dos and Settings
// both open the page slid under Settings and was cut off, and two rail icons were lit.
test('opening Settings closes To-Dos, and opening To-Dos closes it', async ({ page }) => {
  const open = (id: string) => page.evaluate((i) => document.getElementById(i)!.classList.contains('open'), id);
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => toggleTodosPanel());
  expect(await open('todos-panel')).toBe(true);
  await page.click('#rail-settings-btn');
  expect(await open('settings-panel')).toBe(true);
  expect(await open('todos-panel')).toBe(false);
  await expect(page.locator('#todos-toggle.is-active')).toHaveCount(0);
  // Settings fills everything right of the rail (owner 2026-11-02).
  const sheetRight = await page.locator('#settings-panel').evaluate(e => e.getBoundingClientRect().right);
  expect(Math.round(sheetRight)).toBe(1400);

  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => toggleTodosPanel());
  expect(await open('todos-panel')).toBe(true);
  expect(await open('settings-panel')).toBe(false);

  // Help is a pane on the right (owner 2026-11-02), so To-Dos stays open beside it.
  await page.evaluate(() => document.getElementById('help-panel')!.classList.add('open'));
  expect(await open('todos-panel')).toBe(true);
});

// One side slot with different content (owner 2026-11-02: switching felt jumpy). The explorer used to
// slide its width, so the page jumped 320px and slid back. Now the swap happens in one frame and the
// page never moves.
test('switching Documents and To-Dos keeps the page still', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.evaluate(() => { (window as any).setSidebarOpen?.(true); });
  const left = () => page.locator('#header-title').evaluate((e) => Math.round(e.getBoundingClientRect().left));
  const start = await left();
  const track = () => page.evaluate(() => new Promise<number[]>((done) => {
    const xs: number[] = []; const t0 = performance.now();
    const tick = () => { xs.push(Math.round(document.getElementById('header-title')!.getBoundingClientRect().left)); if (performance.now() - t0 < 400) requestAnimationFrame(tick); else done(xs); };
    requestAnimationFrame(tick);
  }));
  const run = async (sel: string) => { const p = track(); await page.locator(sel).click(); return p; };
  for (const xs of [await run('#dock-panel-appbar-toggle'), await run('#rail-docs-btn')]) {
    expect(new Set(xs)).toEqual(new Set([start]));
  }
});

// Bug (owner 2026-11-02): between 900 and 1160px a click on the page closed Help, so the File
// Explorer popped back in. Help is docked from 900px like To-Dos, so it stays until toggled.
test('a click on the page leaves docked Help open; below 900px Help is a sheet and closes', async ({ page }) => {
  for (const [w, stays] of [[1100, true], [1600, true], [800, false]] as const) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.evaluate(() => { const h = document.getElementById('help-panel')!; if (!h.classList.contains('open')) document.getElementById('help-toggle')!.click(); });
    await expect(page.locator('#help-panel')).toBeVisible();
    await page.mouse.click(200, 600);
    if (stays) await expect(page.locator('#help-panel')).toBeVisible();
    else await expect(page.locator('#help-panel')).toBeHidden();
  }
  // As a sheet it covers the "?", so its × closes it.
  await page.locator('#doc-help-btn').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await page.locator('#help-close-btn').click();
  await expect(page.locator('#help-panel')).toBeHidden();
});

// Owner 2026-11-02: Help is a pane on the RIGHT, the standard place (Slack, Office, Google). Documents
// stays open on the left beside it, the page makes room on the right, and dragging Help's left edge
// resizes Help alone.
test('Help opens on the right beside Documents and resizes from its left edge', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  const box = (sel: string) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; });
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => { if (!sidebarOpen) openDocumentsPanel(); });
  await expect(page.locator('#sidebar')).toBeVisible();
  const sideW = (await box('#sidebar')).width;
  await page.locator('#doc-help-btn').click();
  await expect(page.locator('#help-panel')).toBeVisible();
  await expect(page.locator('#sidebar')).toBeVisible();
  const help = await box('#help-panel');
  expect(help.right).toBe(1400);
  expect((await box('#app-layout')).right).toBe(help.left);

  const h = (await page.locator('#help-resize-handle').boundingBox())!;
  await page.mouse.move(h.x + 3, h.y + 300);
  await page.mouse.down();
  await page.mouse.move(h.x - 77, h.y + 300, { steps: 4 });
  await page.mouse.up();
  expect((await box('#help-panel')).width).toBe(help.width + 80);
  expect((await box('#sidebar')).width).toBe(sideW);
  expect(await page.evaluate(() => localStorage.getItem('sakura_help_width_v1'))).toBe(String(help.width + 80));

  // The Documents button just closes Documents; Help stays. × closes Help.
  await page.locator('#rail-docs-btn').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#help-panel')).toBeVisible();
  await expect(page.locator('#doc-help-btn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#help-close-btn').click();
  await expect(page.locator('#help-panel')).toBeHidden();
  await expect(page.locator('#doc-help-btn')).toHaveAttribute('aria-pressed', 'false');
  expect((await box('#app-layout')).right).toBe(1400);
});
