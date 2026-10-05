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

test.describe('Zooming into a childless node lets you actually add a first child', () => {
  test('typing a character while focused on an empty node creates and seeds a child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await expect(page.locator('.focus-empty-state')).toBeVisible();
    await page.keyboard.press('x');

    const afterChar = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
      // @ts-expect-error
      editingId,
    }));
    expect(afterChar.texts).toEqual(['Leaf', 'x']);
    expect(afterChar.depths).toEqual([0, 1]);
    // @ts-expect-error
    const childId = await page.evaluate(() => nodes[1].id);
    expect(afterChar.editingId).toBe(childId);
    await expect(page.locator(`#in-${childId}`)).toBeFocused();
  });

  test('Enter while focused on an empty node also creates a (blank) child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await expect(page.locator('.focus-empty-state')).toBeVisible();
    await page.keyboard.press('Enter');

    const state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
    }));
    expect(state.texts).toEqual(['Leaf', '']);
    expect(state.depths).toEqual([0, 1]);
  });

  test('clicking the placeholder itself also creates a first child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Leaf', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      enterFocus(1);
    });

    await page.locator('.focus-empty-state').click();
    const state = await page.evaluate(() => ({
      // @ts-expect-error
      texts: nodes.map((n: any) => n.text),
      // @ts-expect-error
      depths: nodes.map((n: any) => n.depth),
    }));
    expect(state.texts).toEqual(['Leaf', '']);
    expect(state.depths).toEqual([0, 1]);
  });
});

test.describe('Node rows arm drag-reorder via a long press anywhere on the row, Dynalist-style, not a dedicated handle', () => {
  test('a row is not draggable by default, before any press', async ({ page }) => {
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
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
  });

  test('a brief press-and-release on the label, shorter than the long-press threshold, never arms dragging', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(350);

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
  });

  test('holding the press on the label past the long-press threshold, without moving, arms dragging', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.waitForTimeout(400);

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(true);
    await expect(row).toHaveClass(/drag-armed/);
  });

  test('moving the pointer away before the long-press threshold elapses cancels arming', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.mouse.move(400, 400); // far past the cancel-distance threshold
    await page.waitForTimeout(400); // well past the long-press threshold too

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
    await expect(row).not.toHaveClass(/drag-armed/);
  });

  // A real mouse/trackpad is never perfectly still during a deliberate hold -- natural hand
  // tremor easily drifts a few pixels over 300ms. The cancel-distance must tolerate that or a
  // genuine long-press-to-drag attempt silently fails every time, which is exactly what was
  // reported live: pressing and holding on a node's text never armed dragging.
  test('small jitter well within the cancel-distance during the hold does not cancel arming', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.mouse.move(112, 112); // ~17px of drift -- plausible hand tremor, under the cancel threshold
    await page.waitForTimeout(400);

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(true);
    await expect(row).toHaveClass(/drag-armed/);
  });

  test('releasing the press after arming resets the row back to non-draggable', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Alpha', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 });
    await page.waitForTimeout(400);
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(true);

    await page.mouse.up();

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
    await expect(row).not.toHaveClass(/drag-armed/);
  });

  test('a quick click on the fold dot of a row with children still toggles collapse instantly, no drag', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const foldDot = row.locator('.fold-dot');
    await foldDot.click();

    // @ts-expect-error
    const collapsedAfter = await page.evaluate(() => Array.from(collapsedIds));
    expect(collapsedAfter).toEqual([1]);
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
    await expect(row).not.toHaveClass(/drag-armed/);
  });

  test('a long press on the fold dot of a row with children also arms dragging, Dynalist-style', async ({ page }) => {
    // The fold dot is the most natural, visible place to press on a collapsed/foldable row --
    // it used to be excluded from arming entirely (to not fight with its own instant-mousedown
    // collapse toggle), which silently broke dragging for anyone who pressed there instead of
    // the plain text. It now runs the same long-press timer as the rest of the row; a quick
    // tap still toggles collapse (via the 'click' event, which a completed native drag
    // suppresses), while a sustained press arms dragging just like everywhere else.
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
        { id: 2, depth: 1, text: 'Child', parentId: 1, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 3;
      // @ts-expect-error
      render();
    });

    const row = page.locator('.node-row[data-id="1"]');
    const foldDot = row.locator('.fold-dot');
    await foldDot.dispatchEvent('mousedown', { bubbles: true, clientX: 50, clientY: 50 });
    await page.waitForTimeout(400);

    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(true);
    await expect(row).toHaveClass(/drag-armed/);

    // Releasing without ever moving resets it back to non-draggable, same as the rest of the row.
    await page.mouse.up();
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
  });

  test('node label text is selectable (user-select is not none)', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error
      nodes = [{ id: 1, depth: 0, text: 'Selectable text', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
      // @ts-expect-error
      nextId = 2;
      // @ts-expect-error
      render();
    });

    const userSelect = await page.locator('.node-label').first().evaluate((el) => getComputedStyle(el).userSelect);
    expect(userSelect).not.toBe('none');
  });
});
