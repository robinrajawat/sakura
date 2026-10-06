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
// jumping straight to the Pad panel + the full draw.io editor on every click. The dot toggles
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
      padDiagramsTabEnabled = true;
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

    // Pad never opened -- this is a lightweight inline preview, not a jump to the panel.
    // @ts-expect-error
    expect(await page.evaluate(() => padOpen)).toBe(false);
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
      padDiagramsTabEnabled = true;
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

  test('clicking the preview thumbnail or its open-editor icon opens the real diagram editor', async ({ page }) => {
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
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    await page.locator('.node-diagram-preview-thumb').click();
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
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      inlineExpandDiagramNodeIds = new Set([1]);
      // @ts-expect-error
      render();
    }, FAKE_PREVIEW_SVG);

    await page.locator('.node-diagram-preview-thumb').click();
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
      padDiagramsTabEnabled = true;
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
      padDiagramsTabEnabled = true;
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
      padDiagramsTabEnabled = true;
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
      padDiagramsTabEnabled = true;
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
    // Doesn't jump to the editor or Pad panel -- renaming stays inline.
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
      padDiagramsTabEnabled = true;
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
});
