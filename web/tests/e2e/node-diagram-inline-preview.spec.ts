import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

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
    const level = viewer.locator('.dv-zoom-level');
    const fitText = await level.textContent();
    await viewer.locator('.dv-actual').click();
    await expect(level).toHaveText('100%');
    await viewer.locator('.dv-zoom-in').click();
    await expect(level).toHaveText('125%');
    await viewer.locator('.dv-zoom-out').click();
    await expect(level).toHaveText('100%');
    // Wheel zooms in around the pointer.
    await page.mouse.move(cb!.x + cb!.width / 2, cb!.y + cb!.height / 2);
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => parseInt((await level.textContent())!)).toBeGreaterThan(100);
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
});
