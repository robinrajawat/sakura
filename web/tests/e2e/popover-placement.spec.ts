import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Popovers share one placement rule (src/ui/placePopover.ts, owner 2026-10-24 "standard, unified and
// elegant"): below the anchor, else above it, else pinned to the window's bottom edge.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function open(page: Page, height: number) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1200, height });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.remove();
    const rows = Array.from({ length: 30 }, (_, i) => `normalizeNode({id:${i + 1},depth:0,text:'Row ${i + 1}',parentId:null,isCheckbox:false,checked:false,note:'',tags:[],styles:{}})`).join(',');
    (window as any).eval(`ensureDocumentForEditing(); nodes=[${rows}]; nextId=31; render(); 0`);
  });
}
const box = (page: Page, sel: string) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });

test('the tag popover opens above a row near the bottom, not over it', async ({ page }) => {
  await open(page, 700);
  const id = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.node-row')] as HTMLElement[];
    const low = rows.filter((r) => r.getBoundingClientRect().bottom < window.innerHeight - 40).pop()!;
    return low.dataset.id;
  });
  await page.evaluate((nid) => (window as any).eval(`openTagManager(${nid}); 0`), id);
  await expect(page.locator('#tag-popover')).toHaveClass(/open/);
  const row = await box(page, `.node-row[data-id="${id}"]`);
  const pop = await box(page, '#tag-popover');
  expect(pop.bottom).toBeLessThanOrEqual(row.top);
  expect(pop.top).toBeGreaterThanOrEqual(8);
});

test('the tag popover opens below a row near the top', async ({ page }) => {
  await open(page, 700);
  const id = await page.evaluate(() => (document.querySelector('.node-row') as HTMLElement).dataset.id);
  await page.evaluate((nid) => (window as any).eval(`openTagManager(${nid}); 0`), id);
  const row = await box(page, `.node-row[data-id="${id}"]`);
  const pop = await box(page, '#tag-popover');
  expect(pop.top).toBeGreaterThanOrEqual(row.bottom);
});

test('a popover stays inside the window on the right', async ({ page }) => {
  await open(page, 700);
  await page.evaluate(() => (window as any).eval(`openTagManager(1, {left: window.innerWidth - 20, top: 100, height: 18}); 0`));
  const pop = await box(page, '#tag-popover');
  expect(pop.right).toBeLessThanOrEqual(1200 - 8 + 0.5);
});
