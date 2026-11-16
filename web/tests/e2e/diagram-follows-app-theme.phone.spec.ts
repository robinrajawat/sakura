import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner, 2026-11-16: diagram pictures on the phone "always come in dark mode". draw.io pictures say
// `color-scheme: light dark`, and Safari follows the device's setting inside an image. They are
// pinned to the app's own Light/Dark, in the outline and in the full-screen viewer.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" style="color-scheme: light dark"><rect width="200" height="100" fill="light-dark(#ffffff,#000000)"/></svg>';

test.use({ colorScheme: 'dark' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript((svg) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    // The app is set to Light by hand, while the device is dark.
    localStorage.setItem('sakura_v001_prefs', JSON.stringify({ theme: 'light', themeMode: 'manual' }));
    const n = { id: 1, depth: 0, text: 'Diagram row', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} };
    const previewSvg = 'data:image/svg+xml,' + encodeURIComponent(svg);
    localStorage.setItem('sakura_doc_v1_d', JSON.stringify({ nodes: [n], nextId: 2, collapsed: [], title: 'D', diagrams: [{ id: 'dg1', title: 'Flow', anchorNodeId: 1, previewSvg, createdAt: 1, modifiedAt: 1 }] }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'd', title: 'D', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'd');
  }, SVG);
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
});

const schemeOf = (page: Page, sel: string) => page.locator(sel).first().evaluate((img) => {
  const src = (img as HTMLImageElement).src;
  return (/color-scheme:\s*([^;"]+)/.exec(decodeURIComponent(src.slice(src.indexOf(',') + 1)))?.[1] ?? '').trim();
});

test('diagram pictures follow the app\'s Light/Dark, not the device\'s', async ({ page }) => {
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  await page.locator('.node-diagram-dot').first().click();
  const inline = '.node-diagram-preview-thumb img';
  await expect(page.locator(inline).first()).toBeVisible();
  expect(await schemeOf(page, inline)).toBe('light');
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openDiagramViewer('dg1'));
  expect(await schemeOf(page, '#diagram-viewer .dv-canvas img')).toBe('light');
  await page.keyboard.press('Escape');
  // Switching the app to Dark redraws the outline's picture dark too.
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => setTheme('dark'));
  await expect.poll(() => schemeOf(page, inline)).toBe('dark');
});
