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

test.describe('Node rows only initiate drag-reorder from the leading dot/fold area, not the whole row', () => {
  test('a row is not draggable by default, and stays non-draggable when the press starts on the label', async ({ page }) => {
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

    const label = row.locator('.node-label');
    await label.dispatchEvent('mousedown', { bubbles: true });
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(false);
  });

  test('a mousedown on the leading drag handle marks the row draggable', async ({ page }) => {
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
    const handle = row.locator('.node-drag-handle');
    await expect(handle).toBeVisible();
    await handle.dispatchEvent('mousedown', { bubbles: true });
    expect(await row.evaluate((el) => (el as HTMLElement).draggable)).toBe(true);
  });

  test('a mousedown on the drag handle of a row WITH children arms dragging without toggling collapse', async ({ page }) => {
    // This is the exact bug being fixed: .fold-toggle/.fold-dot mousedown handlers call
    // toggleCollapse() instantly, so a row with children used to be effectively undraggable --
    // any press-and-hold gesture there fired the collapse toggle before a drag could start. The
    // dedicated .node-drag-handle sits outside that machinery entirely.
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
    const handle = row.locator('.node-drag-handle');
    await expect(handle).toBeVisible();
    await handle.dispatchEvent('mousedown', { bubbles: true });

    const state = await row.evaluate((el) => (el as HTMLElement).draggable);
    expect(state).toBe(true);

    // @ts-expect-error
    const collapsedAfter = await page.evaluate(() => Array.from(collapsedIds));
    expect(collapsedAfter).toEqual([]);
    // Child row must still be visible -- nothing collapsed.
    await expect(page.locator('.node-row[data-id="2"]')).toBeVisible();
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
