import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// docs/mobile-plan.md, phase 2: reading on a phone. Fold dots and object icons are 40px targets,
// wide tables scroll in their own box, and pictures and diagrams open full screen, view-only, with
// two-finger pinch and double-tap zoom.
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#cde"/></svg>').toString('base64');
// Ten columns: clearly wider than any phone, whichever font has loaded (six columns only just
// overflowed a Pixel 7 and fit before the web font arrived).
const WIDE = '<table><thead><tr>' + ['Owner', 'Status', 'Due date', 'Notes about the work', 'Budget', 'Region', 'Priority', 'Approver', 'Quarter', 'Reference'].map((h) => `<th>${h}</th>`).join('') +
  '</tr></thead><tbody><tr>' + ['Sam', 'Open', '2026-12-01', 'Waiting for the vendor', '12,000', 'North', 'High', 'Ana Lopez', 'Q4 2026', 'PO-2026-0042'].map((c) => `<td>${c}</td>`).join('') + '</tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ svg, wide }) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    const n = (id: number, depth: number, text: string, parentId: number | null, extra = {}) =>
      ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...extra });
    const nodes = [
      n(1, 0, 'Parent row', null), n(2, 1, 'Child row', 1),
      n(3, 0, 'Table row', null, { tables: [wide] }),
      n(4, 0, 'Picture row', null, { images: [{ id: 'im1', src: svg, caption: 'The picture', annotations: [], createdAt: 1 }] }),
      n(5, 0, 'Diagram row', null)
    ];
    localStorage.setItem('sakura_doc_v1_r', JSON.stringify({ nodes, nextId: 6, collapsed: [], title: 'Reading', diagrams: [{ id: 'dg1', title: 'Flow', anchorNodeId: 5, previewSvg: svg, createdAt: 1, modifiedAt: 1 }, { id: 'dg2', title: 'No picture', anchorNodeId: 5, createdAt: 1, modifiedAt: 1 }] }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: 'r', title: 'Reading', updatedAt: 1 }]));
    localStorage.setItem('sakura_current_doc_v1', 'r');
  }, { svg: SVG, wide: WIDE });
  await page.goto('file://' + indexPath);
  await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
  await expect(page.locator('#editor-pane')).toContainText('Diagram row');
  await expect(page.locator('.pv-table-figure').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

// Two fingers, through Chrome's own touch input, so the page sees real pointer events.
async function pinch(page: Page, cx: number, cy: number, from: number, to: number) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + ((to - from) * i) / 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('a fold dot is a 40px target that folds and unfolds its row', async ({ page }) => {
  const dot = page.locator('.node-row', { hasText: 'Parent row' }).first().locator('.fold-dot');
  await expect(dot).toBeVisible();
  // Measured once, inside the poll: the outline can redraw more than once after load, and a dot
  // caught mid-swap has no box (seen under full-suite load, and on CI with a second separate read).
  let box: { x: number; y: number; width: number; height: number } | null = null;
  await expect.poll(async () => { box = await dot.boundingBox(); return box ? Math.min(box.width, box.height) : 0; }).toBeGreaterThanOrEqual(40);
  box = box!;
  await expect(page.locator('#editor-pane')).toContainText('Child row');
  // A tap near the dot's edge, not on the 18px dot itself, still folds.
  await page.touchscreen.tap(box.x + 4, box.y + 4);
  await expect(page.locator('#editor-pane')).not.toContainText('Child row');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#editor-pane')).toContainText('Child row');
});

test('a wide table scrolls sideways in its own box, never the page', async ({ page }) => {
  const fig = page.locator('.pv-table-figure').first();
  // Polled: the outline can redraw its tables just after first paint, and a figure caught mid-swap
  // measures 0 (seen once under full-suite load on the Pixel 7 profile).
  await expect.poll(() => fig.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeGreaterThan(0);
  await expect.poll(() => fig.evaluate((e) => { e.scrollLeft = 1000; return e.scrollLeft; })).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(fig.locator('th', { hasText: 'Reference' })).toBeAttached();
});

test('the diagram viewer is full screen and view-only; two fingers pinch and a double-tap zooms', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openDiagramViewer('dg1'));
  const ov = page.locator('#diagram-viewer');
  await expect(ov).toHaveClass(/open/);
  const win = (await ov.locator('.dv-window').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(win).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  await expect(ov.locator('.dv-edit')).toBeHidden();
  await expect(ov.locator('.dv-delete')).toBeHidden();
  // @ts-expect-error -- bare global from index.html
  const scale = () => page.evaluate(() => _dvState.scale as number);
  const fit = await scale();
  const c = (await ov.locator('.dv-canvas').boundingBox())!;
  await pinch(page, c.x + c.width / 2, c.y + c.height / 2, 60, 240);
  expect(await scale()).toBeGreaterThan(fit * 2.5);
  await pinch(page, c.x + c.width / 2, c.y + c.height / 2, 240, 60);
  expect(Math.abs((await scale()) - fit)).toBeLessThan(fit * 0.2);
  // Double-tap: closer look, then back to fit.
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => _dvFit(false));
  await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
  await page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2);
  await expect.poll(scale).toBe(1);
});

test('a diagram is never opened for editing on a phone', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openDiagramViewer('dg2'));
  await expect(page.locator('#toast')).toContainText('Open it on a computer');
  await expect(page.locator('#diagram-editor-overlay')).toBeHidden();
  await expect(page.locator('iframe[src*="diagrams.net"], iframe[src*="drawio"]')).toHaveCount(0);
});

test('the picture viewer is full screen and view-only; two fingers pinch', async ({ page }) => {
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => openNodeImageViewer(4, 'im1'));
  const ov = page.locator('#node-image-viewer');
  await expect(ov.locator('.niv-panel')).toBeVisible();
  const vp = page.viewportSize()!;
  expect(await ov.locator('.niv-panel').boundingBox()).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  await expect(ov.locator('.niv-markup-toggle')).toBeHidden();
  await expect(ov.locator('.niv-delete')).toBeHidden();
  // @ts-expect-error -- bare global from index.html
  const s = () => page.evaluate(() => _nivZoom.s as number);
  const st = (await ov.locator('.niv-stage').boundingBox())!;
  await pinch(page, st.x + st.width / 2, st.y + st.height / 2, 60, 200);
  expect(await s()).toBeGreaterThan(2);
});
