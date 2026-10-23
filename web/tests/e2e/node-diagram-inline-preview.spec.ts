import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display='none'; });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

const FAKE_PREVIEW_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>');
// A realistically-sized diagram export (typical draw.io dimensions), to prove the preview shows
// the real diagram at something close to its own size rather than squashing it into a small
// fixed-size thumbnail that's illegible for anything but the simplest diagram.
const LARGE_PREVIEW_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white" stroke="black"/><text x="40" y="40">Step 1</text></svg>');

// Diagrams now preview inline the same way notes/remarks/Q&A already do, instead of the dot
// jumping straight to the full draw.io editor on every click. The dot toggles
// an inline preview card (thumbnail + title); actually editing the diagram still requires
// opening the real editor, reached by clicking the preview itself or its "open" icon.
test.describe('Diagrams preview inline on the node, like notes/remarks/Q&A', () => {
  // The welcome dialog can open after dismissOverlays() has looked for it and then swallow clicks
  // (seen intermittently in CI); marking it seen up front keeps it closed.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  });
  test('clicking the diagram dot expands an inline preview instead of jumping straight to the editor', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'My Flow', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    const row = page.locator('.node-row[data-id="1"]');
    const dot = row.locator('.node-diagram-dot');
    await expect(dot).toBeVisible();
    expect(await dot.getAttribute('data-tip')).toContain('expand inline');
    expect(await dot.getAttribute('data-tip')).not.toContain('click to open');

    await dot.click();
    const preview = page.locator('.node-diagram-line .node-diagram-preview-card');
    await expect(preview).toBeVisible();
    await expect(preview.locator('.node-diagram-preview-title')).toHaveText('My Flow');
    await expect(preview.locator('.node-diagram-preview-thumb img')).toHaveCount(1);

    // Nothing opened -- this is a lightweight inline preview, not a jump to the editor.
    await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);

    // Toggling again collapses it.
    await dot.click();
    await expect(preview).not.toBeVisible();
  });

  test('a diagram with no saved preview yet shows a placeholder, not a broken image', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'My Flow', xml: '', previewSvg: '', pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    });

    const thumb = page.locator('.node-diagram-preview-thumb');
    await expect(thumb).toBeVisible();
    await expect(thumb.locator('img')).toHaveCount(0);
    await expect(thumb.locator('svg')).toHaveCount(1);
  });

  test('clicking the thumbnail opens the preview; its Edit button (or the open-editor icon) opens the real diagram editor', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'My Flow', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    await page.locator('.node-diagram-preview-thumb').click();
    await expect(page.locator('#diagram-viewer')).toHaveClass(/open/);
    await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('#diagram-viewer .dv-edit')).toHaveText('Edit');
    await page.locator('#diagram-viewer .dv-edit').click();
    await expect(page.locator('#diagram-viewer')).not.toHaveClass(/open/);
    await expect(page.locator('#diagram-editor-overlay')).toHaveClass(/open/);
  });

  test('renaming the diagram in the full editor and closing it updates the inline preview immediately, no reload needed', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Old name', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    await page.locator('.node-diagram-preview-thumb').click();
    await page.locator('#diagram-viewer .dv-edit').click();
    await expect(page.locator('#diagram-editor-overlay')).toHaveClass(/open/);

    const titleInput = page.locator('#diagram-editor-title-input');
    await titleInput.fill('New name');
    await titleInput.dispatchEvent('input');

    // closeDiagramEditorInternal bypasses the unsaved-changes confirm dialog that
    // closeDiagramEditor() shows -- this test is about the refresh-on-close behavior, not
    // that dialog.
    await page.evaluate(() => {
      // @ts-expect-error
      closeDiagramEditorInternal();
    });

    await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('.node-diagram-preview-title')).toHaveText('New name');
  });

  test('a node with multiple diagrams gets one preview line per diagram', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [
        { id: 'd1', anchorNodeId: 1, title: 'Flow A', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true },
        { id: 'd2', anchorNodeId: 1, title: 'Flow B', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true },
      ];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    const titles = await page.locator('.node-diagram-line .node-diagram-preview-title').allTextContents();
    expect(titles).toEqual(['Flow A', 'Flow B']);
  });

  test('the preview shows the real diagram at its own size, not a tiny fixed thumbnail', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Big Flow', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, LARGE_PREVIEW_SVG);

    const thumb = page.locator('.node-diagram-preview-thumb');
    await expect(thumb).not.toHaveClass(/node-diagram-preview-empty/);
    const img = thumb.locator('img');
    const box = await img.boundingBox();
    expect(box).not.toBeNull();
    // Old behavior squashed every preview into a 240x150 box regardless of the real diagram's
    // size. The real diagram here is 800x500 -- the rendered width must be well past the old
    // thumbnail's cap, proving it's sized from the actual image, not a fixed small box.
    expect(box!.width).toBeGreaterThan(300);
  });

  test('the preview keeps a margin between the diagram and the frame, even when the diagram fills the width', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    // Wider than the editor, so the image is scaled down to fill the frame (owner's case: a
    // diagram whose own border ran straight into the preview's edge).
    const wide = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="1500"><rect width="3000" height="1500" fill="white" stroke="red"/></svg>');
    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Wide', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, wide);

    const thumb = page.locator('.node-diagram-preview-thumb');
    const t = (await thumb.boundingBox())!;
    const i = (await thumb.locator('img').boundingBox())!;
    expect(i.x - t.x).toBeGreaterThanOrEqual(10);
    expect(i.y - t.y).toBeGreaterThanOrEqual(10);
    expect(t.x + t.width - (i.x + i.width)).toBeGreaterThanOrEqual(10);
    expect(t.y + t.height - (i.y + i.height)).toBeGreaterThanOrEqual(10);
  });

  test('a node with no diagrams shows no diagram dot and no inline preview', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Plain node', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [];
      // @ts-expect-error
      render();
    });

    await expect(page.locator('.node-diagram-dot')).toHaveCount(0);
    await expect(page.locator('.node-diagram-line')).toHaveCount(0);
  });

  test('the diagram title can be renamed directly in the inline preview', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Old name', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    const title = page.locator('.node-diagram-preview-title');
    await expect(title).toHaveText('Old name');

    // Select-all + type, the same way the remark/QA inline fields are edited.
    await title.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('New name');
    await title.blur();

    await expect(title).toHaveText('New name');
    // Doesn't jump to the editor -- renaming stays inline.
    await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
    // @ts-expect-error
    expect(await page.evaluate(() => diagrams[0].title)).toBe('New name');
  });

  test('Escape while renaming the inline diagram title reverts the edit', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Keep me', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    const title = page.locator('.node-diagram-preview-title');
    await title.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Discard this');
    await page.keyboard.press('Escape');

    await expect(title).toHaveText('Keep me');
    // @ts-expect-error
    expect(await page.evaluate(() => diagrams[0].title)).toBe('Keep me');
  });

  // Owner, 2026-10-20: "a click should open a preview" with zoom in/out, not straight into draw.io.
  test('the preview opens fitted, zooms with the wheel and the buttons, pans by dragging, and closes with Esc', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Order flow', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Night delivery', xml: '<mxGraphModel/>', previewSvg: svg, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, LARGE_PREVIEW_SVG);
    await page.locator('.node-diagram-preview-thumb').click();
    const viewer = page.locator('#diagram-viewer');
    await expect(viewer).toHaveClass(/open/);
    await expect(viewer.locator('.dv-title')).toHaveText('Night delivery');
    await expect(viewer.locator('.dv-where')).toContainText('Order flow');
    const img = viewer.locator('.dv-canvas img');
    const canvas = viewer.locator('.dv-canvas');
    // Fitted: the whole diagram is inside the window, centred.
    const [ib, cb] = [await img.boundingBox(), await canvas.boundingBox()];
    expect(ib!.x).toBeGreaterThanOrEqual(cb!.x);
    expect(ib!.x + ib!.width).toBeLessThanOrEqual(cb!.x + cb!.width);
    expect(Math.abs((ib!.x + ib!.width / 2) - (cb!.x + cb!.width / 2))).toBeLessThan(2);
    // The sheet keeps a margin around a borderless draw.io export (owner: "cutting very sharp from left").
    expect(await img.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))).toBe(12);
    const level = viewer.locator('.dv-zoom-level');
    const fitText = await level.textContent();
    await viewer.locator('.dv-actual').click();
    await expect(level).toHaveText('100%');
    await viewer.locator('.dv-zoom-in').click();
    await expect(level).toHaveText('120%');
    await viewer.locator('.dv-zoom-out').click();
    await expect(level).toHaveText('100%');
    // Ctrl+wheel (what a pinch sends) zooms in around the pointer.
    await page.mouse.move(cb!.x + cb!.width / 2, cb!.y + cb!.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(async () => parseInt((await level.textContent())!)).toBeGreaterThan(100);
    // One wheel notch is a gentle step, not a jump (owner: zoom was "very aggressive").
    expect(parseInt((await level.textContent())!)).toBeLessThanOrEqual(115);
    // A plain scroll (a two-finger swipe) pans instead of zooming, so every part can be reached.
    const zoomed = await level.textContent();
    const beforeScroll = (await img.boundingBox())!;
    await page.mouse.wheel(40, 120);
    await expect.poll(async () => Math.round((await img.boundingBox())!.y - beforeScroll.y)).toBe(-120);
    expect(Math.round((await img.boundingBox())!.x - beforeScroll.x)).toBe(-40);
    await expect(level).toHaveText(zoomed!);
    // Drag pans.
    const before = (await img.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(cb!.x + cb!.width / 2 + 60, cb!.y + cb!.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    const after = (await img.boundingBox())!;
    expect(Math.round(after.x - before.x)).toBe(60);
    expect(Math.round(after.y - before.y)).toBe(30);
    await viewer.locator('.dv-fit').click();
    await expect(level).toHaveText(fitText!);
    await page.keyboard.press('Escape');
    await expect(viewer).not.toHaveClass(/open/);
    await expect(page.locator('#diagram-editor-overlay')).not.toHaveClass(/open/);
  });
  // Owner, 2026-10-22: a download option in the preview, and a quick right-click menu on the thumbnail.
  async function seedOne(page: import('@playwright/test').Page) {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await page.evaluate((svg) => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Order flow', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 2;
      // @ts-expect-error
      diagrams = [{ id: 'd1', anchorNodeId: 1, title: 'Night: delivery', xml: '<mxGraphModel/>', previewSvg: svg, previewBorder: 12, pageSvgs: [], pageCount: 1, status: 'draft', note: '', createdAt: Date.now(), modifiedAt: Date.now(), _hydrated: true }];
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, LARGE_PREVIEW_SVG);
  }

  test('the preview downloads the diagram as a 2x PNG or as SVG, named after its title', async ({ page }) => {
    await seedOne(page);
    await page.locator('.node-diagram-preview-thumb').click();
    const viewer = page.locator('#diagram-viewer');
    await expect(viewer).toHaveClass(/open/);
    await viewer.locator('.dv-download').click();
    const menu = page.locator('.sb-context-menu');
    await expect(menu).toBeVisible();
    // The menu sits above the viewer, not hidden behind it.
    await expect(menu.getByText('PNG image')).toBeVisible();
    const [png] = await Promise.all([page.waitForEvent('download'), menu.getByText('PNG image').click()]);
    expect(png.suggestedFilename()).toBe('Night- delivery.png');
    const buf = fs.readFileSync(await png.path());
    // PNG header: twice the diagram's 800x500 size (its margin comes from draw.io's own export border).
    expect(buf.readUInt32BE(16)).toBe(1600);
    expect(buf.readUInt32BE(20)).toBe(1000);
    await viewer.locator('.dv-download').click();
    const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('.sb-context-menu').getByText('SVG', { exact: false }).click()]);
    expect(svg.suggestedFilename()).toBe('Night- delivery.svg');
    const svgText = fs.readFileSync(await svg.path(), 'utf8');
    expect(svgText).toContain('<svg');
    expect(svgText).toContain('width="800"');
  });

  test('right-clicking the thumbnail offers the same menu as a picture: Open, Copy image, Download, Rename, Edit, Delete (with undo)', async ({ page }) => {
    await seedOne(page);
    const thumb = page.locator('.node-diagram-preview-thumb');
    await thumb.click({ button: 'right' });
    const menu = page.locator('.sb-context-menu');
    await expect(menu.locator('.sb-context-item')).toHaveText([/^Open$/, /Copy image/, /Download/, /Rename/, /Edit in draw\.io/, /Delete diagram/]);
    await menu.getByText('Open', { exact: true }).click();
    await expect(page.locator('#diagram-viewer')).toHaveClass(/open/);
    await page.keyboard.press('Escape');

    await thumb.click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Rename').click();
    const title = page.locator('.node-diagram-preview-title');
    await expect(title).toBeFocused();
    await page.keyboard.type('Route plan');
    await page.keyboard.press('Enter');
    // @ts-expect-error
    await expect.poll(() => page.evaluate(() => diagrams[0].title)).toBe('Route plan');

    await thumb.click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Delete diagram').click();
    await expect(page.locator('.node-diagram-preview-thumb')).toHaveCount(0);
    // @ts-expect-error
    expect(await page.evaluate(() => diagrams.length)).toBe(0);
    await page.locator('#toast .toast-action-btn').click();
    await expect(page.locator('.node-diagram-preview-thumb')).toHaveCount(1);
  });
  test('Copy image from the thumbnail menu or the preview puts a PNG on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedOne(page);
    await page.locator('.node-diagram-preview-thumb').click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Copy image').click();
    await expect(page.locator('#toast')).toContainText('Image copied');
    expect(await page.evaluate(async () => (await navigator.clipboard.read())[0].types)).toContain('image/png');
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.locator('.node-diagram-preview-thumb').click();
    await page.locator('#diagram-viewer .dv-copy').click();
    await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.read())[0].types)).toContain('image/png');
  });
  // Owner, 2026-10-22: the margin comes from draw.io's export (its `border`), not from padding the file ourselves.
  test('a picture with draw.io\'s margin drops the thumbnail padding; an older tight one is re-exported before download', async ({ page }) => {
    await seedOne(page);
    const thumb = page.locator('.node-diagram-preview-thumb');
    await expect(thumb).toHaveClass(/has-export-border/);
    expect(await thumb.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px');
    await thumb.click();
    expect(await page.locator('#diagram-viewer').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--dv-pad'))).toBe('0px');
    await page.keyboard.press('Escape');

    const tight = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>');
    const bordered = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="124" height="74"><rect x="12" y="12" width="100" height="50"/></svg>');
    await page.evaluate(([t, b]) => {
      const w = window as any;
      w.eval('diagrams[0].previewSvg = ' + JSON.stringify(t) + '; delete diagrams[0].previewBorder; render();');
      // Stands in for the offscreen draw.io frame (no network in tests).
      w.regenerateDiagramThumbnail = async (id: string) => { const d = w.findDiagram(id); d.previewSvg = b; d.previewBorder = 12; w.__regen = (w.__regen || 0) + 1; };
    }, [tight, bordered]);
    await expect(thumb).not.toHaveClass(/has-export-border/);
    expect(await thumb.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('12px');
    await thumb.click({ button: 'right' });
    await page.locator('.sb-context-menu').getByText('Download').hover();
    const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('.sb-context-menu').getByText('SVG', { exact: false }).click()]);
    expect(fs.readFileSync(await svg.path(), 'utf8')).toContain('width="124"');
    expect(await page.evaluate(() => (window as any).__regen)).toBe(1);
  });
});
