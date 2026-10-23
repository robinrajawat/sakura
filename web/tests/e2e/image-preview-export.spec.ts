import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Copy image and Download in the image preview and the thumbnail's right-click menu (owner,
// 2026-10-23: the image preview was missing what the diagram preview has). A marked-up picture
// downloads with its markings by default; "Original" is the stored file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const SHOT = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#f4f5f7"/></svg>'
).toString('base64');
const MARK = { id: 'r1', type: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5, color: '#e8384f', strokeWidth: 0.01 };

async function open(page: Page, annotations: unknown[] = []) {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(({ src, annotations }) => {
    document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove();
    (window as any).eval(`ensureDocumentForEditing(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'Screens', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {},
      images: [{ id: 'i1', src: ${JSON.stringify(src)}, caption: 'Login page', annotations: ${JSON.stringify(annotations)} }] })];
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; editingId = null; nextId = 2; undoStack = []; render();`);
  }, { src: SHOT, annotations });
}

test('the preview downloads an unmarked picture as it is, and copies it as an image', async ({ page }) => {
  await open(page);
  await page.locator('.node-image-thumb').first().click();
  const viewer = page.locator('#node-image-viewer');
  await expect(viewer).toHaveClass(/open/);
  const [dl] = await Promise.all([page.waitForEvent('download'), viewer.locator('.niv-download').click()]);
  expect(dl.suggestedFilename()).toBe('Login page.svg');
  // The button itself says it worked (the toast would sit behind the preview).
  await viewer.locator('.niv-copy').click();
  await expect(viewer.locator('.niv-copy')).toHaveClass(/is-copied/);
  await expect(viewer.locator('.niv-copy')).not.toHaveClass(/is-copied/, { timeout: 3000 });
  const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
  expect(types).toContain('image/png');
});

test('a marked-up picture offers With markings (a PNG) or Original, in the preview and the thumbnail menu', async ({ page }) => {
  await open(page, [MARK]);
  await page.locator('.node-image-thumb').first().click();
  const viewer = page.locator('#node-image-viewer');
  await viewer.locator('.niv-download').click();
  const menu = page.locator('.sb-context-menu');
  const [marked] = await Promise.all([page.waitForEvent('download'), menu.getByText('With markings').click()]);
  expect(marked.suggestedFilename()).toBe('Login page.png');
  const bytes = fs.readFileSync(await marked.path());
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  await page.keyboard.press('Escape');

  await page.locator('.node-image-thumb').first().click({ button: 'right' });
  await expect(menu).toContainText('Copy image');
  await menu.getByText('Copy image').click();
  await expect(page.locator('.node-image-thumb .copied-badge')).toHaveText('Copied');
  await page.locator('.node-image-thumb').first().click({ button: 'right' });
  await menu.getByText('Download').hover();
  const [orig] = await Promise.all([page.waitForEvent('download'), page.locator('.sb-context-menu').getByText('Original').click()]);
  expect(orig.suggestedFilename()).toBe('Login page.svg');
});

test('zoom: Ctrl+scroll zooms in gentle steps around the pointer, a drag moves it, 0 fits again', async ({ page }) => {
  await open(page);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.locator('.node-image-thumb').first().click();
  const viewer = page.locator('#node-image-viewer');
  const fig = viewer.locator('.niv-figure');
  await expect(viewer.locator('.niv-zoom-level')).toHaveText('Fit');
  const box = (await fig.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100); // one mouse-wheel notch
  await page.keyboard.up('Control');
  const scale = () => page.evaluate(() => (window as any).eval('_nivZoom.s'));
  await expect.poll(scale).toBeGreaterThan(1.05);
  expect(await scale()).toBeLessThan(1.2); // one notch is a small step, not a jump
  await expect(viewer).toHaveClass(/niv-zoomed/);
  // A drag moves the zoomed picture.
  const before = (await fig.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30); await page.mouse.up();
  const after = (await fig.boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(60);
  await expect(viewer).toHaveClass(/open/);
  await page.keyboard.press('0');
  await expect.poll(scale).toBe(1);
  await expect(viewer.locator('.niv-zoom-level')).toHaveText('Fit');
  // + steps in; stepping to another picture or closing starts again at Fit.
  await page.keyboard.press('+');
  await expect.poll(scale).toBeCloseTo(1.2, 5);
});
