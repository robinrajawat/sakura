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
test('opening Settings or Help closes To-Dos, and opening To-Dos closes them', async ({ page }) => {
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

  await page.evaluate(() => document.getElementById('help-panel')!.classList.add('open'));
  expect(await open('todos-panel')).toBe(false);
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
    await page.mouse.click(w - 60, 600);
    if (stays) await expect(page.locator('#help-panel')).toBeVisible();
    else await expect(page.locator('#help-panel')).toBeHidden();
  }
});

// Owner 2026-11-02: "isn't it the same shared panel?" Help behaves like To-Dos in the side slot:
// the Documents button takes the slot over, and Help's edge drags the one shared width.
test('Documents takes the slot over from Help, and Help resizes the shared width', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.evaluate(() => document.getElementById('help-toggle')!.click());
  await expect(page.locator('#help-panel')).toBeVisible();
  const handle = page.locator('#help-resize-handle');
  await expect(handle).toBeVisible();
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + 3, h.y + 300);
  await page.mouse.down();
  await page.mouse.move(h.x + 83, h.y + 300, { steps: 4 });
  await page.mouse.up();
  const w = await page.locator('#help-panel').evaluate((e) => Math.round(e.getBoundingClientRect().width));
  expect(w).toBeGreaterThan(380);
  await page.locator('#rail-docs-btn').click();
  await expect(page.locator('#help-panel')).toBeHidden();
  await expect(page.locator('#sidebar')).toBeVisible();
  expect(await page.locator('#sidebar').evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(w);
});
