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
});
