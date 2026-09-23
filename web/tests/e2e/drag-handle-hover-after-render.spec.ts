import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

async function dismissOverlays(page: import('@playwright/test').Page) {
  const landing = page.locator('#sakura-landing-overlay');
  if (await landing.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      const el = document.getElementById('sakura-landing-overlay');
      if (el) el.style.display = 'none';
    });
  }
  const welcome = page.locator('#welcome-overlay');
  if (await welcome.isVisible().catch(() => false)) {
    await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
  }
}

// render() replaces every row's DOM wholesale on any structural change, even when the mouse
// hasn't moved. CSS :hover is only recomputed by the browser on an actual pointer event, never
// just because new DOM appeared under an already-stationary cursor -- so without
// reapplyPointerHoverAfterRender(), a hover-revealed element like .node-drag-handle got stuck at
// its base (invisible) opacity after any render() until the next real mouse movement. Reported
// as "the drag hand cursor icon is getting hidden sometimes".
test.describe('The drag handle stays visible across a render() while the mouse sits still over it', () => {
  test('a render() while hovering the drag handle keeps it visible (pointer-hover class), not stuck invisible', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
    });

    const handle = page.locator('.node-row[data-id="1"] .node-drag-handle');
    const box = await handle.boundingBox();
    if (!box) throw new Error('drag handle not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    // Real hover first, to prove the baseline hover mechanism itself works (row-level .55 via
    // .node-row:hover, or the full 1 via .node-drag-handle:hover if the tiny hit target is
    // pixel-perfect -- either counts as "genuinely hovering", so just check it's non-zero rather
    // than pinning an exact value that depends on sub-pixel targeting of a 10px-wide element).
    await expect
      .poll(async () => Number(await handle.evaluate((el) => getComputedStyle(el).opacity)))
      .toBeGreaterThan(0);

    // Something unrelated triggers a full render() (a structural change elsewhere, an autosave-
    // driven refresh, etc.) while the mouse never moves.
    await page.evaluate(() => {
      // @ts-expect-error
      render();
    });

    // Without the fix this stays at the base opacity (0) indefinitely, since no real pointer
    // event ever fires to make the browser recompute :hover for the brand-new element.
    const rowHasClass = await page.locator('.node-row[data-id="1"]').evaluate((el) => el.classList.contains('pointer-hover'));
    expect(rowHasClass).toBe(true);
    await expect
      .poll(async () => Number(await page.locator('.node-row[data-id="1"] .node-drag-handle').evaluate((el) => getComputedStyle(el).opacity)))
      .toBeGreaterThan(0);
  });

  test('moving the mouse away after such a render() correctly hides it again', async ({ page }) => {
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
      render();
    });

    const handle = page.locator('.node-row[data-id="1"] .node-drag-handle');
    const box = await handle.boundingBox();
    if (!box) throw new Error('drag handle not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(async () => Number(await handle.evaluate((el) => getComputedStyle(el).opacity)))
      .toBeGreaterThan(0);

    await page.evaluate(() => {
      // @ts-expect-error
      render();
    });
    await expect(page.locator('.node-row[data-id="1"]')).toHaveClass(/pointer-hover/);

    // A genuine pointer movement away must clear the synthetic marker -- it should never linger
    // on a row the mouse has actually left.
    await page.mouse.move(5, 5);
    await expect(page.locator('.node-row[data-id="1"]')).not.toHaveClass(/pointer-hover/);
    await expect(page.locator('.node-row[data-id="1"] .node-drag-handle')).toHaveCSS('opacity', '0');
  });

  test('a render() while the mouse is elsewhere (not hovering any row) does not mark any row hovered', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 0, text: 'Beta', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      render();
    });

    await page.mouse.move(2, 2); // corner of the page, away from any row
    await page.evaluate(() => {
      // @ts-expect-error
      render();
    });

    const anyHovered = await page.evaluate(() => document.querySelectorAll('.node-row.pointer-hover').length);
    expect(anyHovered).toBe(0);
  });
});
