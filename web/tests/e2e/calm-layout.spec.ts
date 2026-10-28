import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Calm layout (trial, owner 2026-10-28): Settings → General → Layout. The app bar becomes a left
// rail, the toolbar row and status bar go, and open items · History · Share sit beside the title.

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

test('Standard is the default; the Layout switch turns Calm on and is remembered', async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.classList.contains('calm-layout'))).toBe(false);
  await page.evaluate(() => document.getElementById('settings-toggle')?.click());
  await page.locator('#layout-segmented .theme-seg[data-layout="calm"]').click();
  await expect(page.locator('#layout-segmented .theme-seg[data-layout="calm"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => document.documentElement.classList.contains('calm-layout'))).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains('calm-layout'))).toBe(true);
});

test('calm: rail on the left, no toolbar row or status bar, page actions beside the title', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setCalmLayout(true);
  });
  const m = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    return {
      rail: r('appbar'), editor: r('editor-wrap'), share: r('doc-share-chip'), title: r('header-title'),
      statusbar: getComputedStyle(document.getElementById('statusbar')!).display,
      undo: getComputedStyle(document.getElementById('undo-btn')!.closest('.action-group')!).display,
      inPage: !!document.getElementById('editor-wrap')!.contains(document.getElementById('quick-bar')),
      tabs: getComputedStyle(document.getElementById('doc-tab-strip-row')!).display
    };
  });
  expect(m.rail.width).toBeLessThan(60);
  expect(m.rail.height).toBeGreaterThan(400);
  expect(m.statusbar).toBe('none');
  expect(m.undo).toBe('none');
  expect(m.inPage).toBe(true);
  expect(m.share.top).toBeLessThan(m.title.bottom);
  expect(m.tabs).toBe('none');
  // The rail's Documents button opens the file explorer.
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setSidebarOpen(false);
  });
  await page.locator('#rail-docs-btn').click();
  expect(await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    return sidebarOpen;
  })).toBe(true);
});

test('turning calm off puts the toolbar back where it was', async ({ page }) => {
  const before = await page.evaluate(() => document.getElementById('quick-bar')!.parentElement!.id || 'anon');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    setCalmLayout(true); setCalmLayout(false);
  });
  const after = await page.evaluate(() => ({
    parent: document.getElementById('quick-bar')!.parentElement!.id || 'anon',
    next: document.getElementById('quick-bar')!.nextElementSibling!.id
  }));
  expect(after.parent).toBe(before);
  expect(after.next).toBe('editor-row');
  await expect(page.locator('#undo-btn')).toBeVisible();
});
