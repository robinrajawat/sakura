import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The layout (owner 2026-10-28: tried as "Calm", now the only one): the app bar is a left rail, there
// is no toolbar row or status bar, History and Share sit on the top line, open items under the title,
// and everything the rail opens sits beside it.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
});

test('one layout: no switch, a rail on the left, no toolbar row or status bar', async ({ page }) => {
  await expect(page.locator('html')).toHaveClass(/calm-layout/);
  await expect(page.locator('#layout-segmented')).toHaveCount(0);
  const m = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    return {
      rail: r('appbar'), share: r('doc-share-chip'), title: r('header-title'),
      wordcount: getComputedStyle(document.getElementById('sb-wordcount')!).display,
      undo: getComputedStyle(document.getElementById('undo-btn')!.closest('.action-group')!).display,
      onTopLine: document.getElementById('doc-tab-strip-row')!.contains(document.getElementById('quick-bar')),
      marksUnderTitle: document.getElementById('editor-meta-row')!.contains(document.getElementById('ag-markers'))
    };
  });
  expect(m.rail.width).toBeLessThan(60);
  expect(m.rail.height).toBeGreaterThan(400);
  expect(m.wordcount).toBe('none');
  expect(m.undo).toBe('none');
  expect(m.onTopLine).toBe(true);
  expect(m.marksUnderTitle).toBe(true);
  expect(m.share.bottom).toBeLessThan(m.title.top);
});

test('the rail: Documents and To-Dos share the slot beside it; Settings opens from its gear', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setSidebarOpen(false);
  });
  await page.locator('#rail-docs-btn').click();
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(true);
  await page.locator('#dock-panel-appbar-toggle').click();
  await expect(page.locator('#todos-panel')).toHaveClass(/open/);
  // @ts-expect-error -- bare globals from index.html
  expect(await page.evaluate(() => sidebarOpen)).toBe(false);
  const todos = await page.locator('#todos-panel').boundingBox();
  expect(todos!.x).toBeLessThan(60);
  await page.locator('#rail-docs-btn').click();
  await expect(page.locator('#todos-panel')).not.toHaveClass(/open/);
  await page.locator('#rail-settings-btn').click();
  await expect(page.locator('#settings-panel')).toHaveClass(/open/);
});

test('the top line is always there; Import is in the File Explorer, Export under Share', async ({ page }) => {
  await expect(page.locator('#doc-tab-strip-row')).toBeVisible();
  await expect(page.locator('#appbar-more-toggle')).toHaveCount(0);
  await expect(page.locator('#sb-import-btn')).toHaveCount(1);
  await page.locator('#doc-share-chip').click();
  await expect(page.locator('#share-menu .sb-context-item[data-save="opml"]')).toBeVisible();
});
