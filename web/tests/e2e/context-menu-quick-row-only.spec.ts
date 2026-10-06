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

async function seedOneNode(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }];
    // @ts-expect-error
    collapsedIds = new Set();
    // @ts-expect-error
    selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    nextId = 2;
    // @ts-expect-error
    render();
  });
}

// The right-click menu used to have two overlapping settings: "Quick row" (placement --
// quick row vs "More") and "Menu items" (full removal from the menu entirely). Having both
// was confusing and the second one was also the actual cause of a reported bug (a newly added
// action missing its own checkbox there, silently making it un-removable to look for). Removed
// entirely -- "Quick row" is now the only control, and nothing can be removed from the menu
// outright, only repositioned between the quick row and "More".
test.describe('Right-click menu has only one placement setting (Quick row), not a separate full-removal one', () => {
  test('the "Menu items" settings section no longer exists', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await expect(page.locator('#ctx-hidden-field')).toHaveCount(0);
    await expect(page.locator('#ctx-hidden-header')).toHaveCount(0);
    await expect(page.locator('[id^="ctxh-"]')).toHaveCount(0);
  });

  test('unchecking an action from Quick row moves it to "More" instead of removing it from the menu', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    // 'note' is in the default quick row.
    await page.evaluate(() => {
      // @ts-expect-error
      setContextQuickActions(contextQuickActions.filter((a: string) => a !== 'note'));
    });

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });

    await expect(page.locator('#context-quickbar .pv-qm-btn[data-action="note"]')).toHaveCount(0);
    const moreToggle = page.locator('#context-more-toggle');
    await moreToggle.click();
    // Still reachable -- just relocated, never fully removed.
    await expect(page.locator('#context-more-panel [data-action="note"]')).toBeVisible();
  });

  test('"Sort children" always appears in "More", with no setting to remove it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    // Give the node children so Sort children is actually offered.
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
    await row.click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-sort-label')).toBeVisible();
    await expect(page.locator('#context-more-panel [data-action="sort-az"]')).toBeVisible();
  });

  test('the settings summary just reports the quick-row count, not a "menu items shown" count', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const text = await page.evaluate(() => document.getElementById('rightclick-menu-summary-desc')?.textContent);
    expect(text).toMatch(/^\d+ in quick row$/);
  });

  // contextQuickActions can hold more entries than are sensible to actually show as icons --
  // checking every box in Settings is allowed, but the quick row itself caps at 6 (its own
  // natural width before a context menu starts looking cluttered or running wider than the
  // menu). Anything past the 6th, in the user's own drag-to-reorder sequence, falls through to
  // "More" exactly as if it had never been checked.
  test('only the first 6 checked quick-row actions render as icons; the rest fall through to "More"', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const order = await page.evaluate(() => {
      // All 8 notes/ai/structure actions that are allowed by default (no feature gates needed).
      const nine = ['child','above','below','duplicate','up','down','ai-rewrite','note','qa'];
      // @ts-expect-error
      setContextQuickActions(nine);
      // @ts-expect-error
      return [...contextQuickActions];
    });
    expect(order.length).toBe(9);

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });

    const quickActions = await page.evaluate(() =>
      // @ts-expect-error
      [...document.querySelectorAll('#context-quickbar .pv-qm-btn')].map(b => b.dataset.action)
    );
    expect(quickActions).toEqual(order.slice(0, 6));

    await page.locator('#context-more-toggle').click();
    for (const overflowAction of order.slice(6)) {
      await expect(page.locator(`#context-more-panel [data-action="${overflowAction}"]`)).toBeVisible();
    }
    // The 6 visible in the quick row must NOT also be duplicated into "More".
    for (const visibleAction of order.slice(0, 6)) {
      await expect(page.locator(`#context-more-panel [data-action="${visibleAction}"]`)).toHaveCount(0);
    }
  });

  test('the default quick row is the 6-item curated set, matching "Reset" in Settings', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const initial = await page.evaluate(() =>
      // @ts-expect-error
      [...contextQuickActions]
    );
    expect(initial).toEqual(['ai-rewrite', 'note', 'remark', 'qa', 'diagram', 'tags']);

    // Mess with it, then Reset should bring back exactly the same default.
    await page.evaluate(() => {
      // @ts-expect-error
      setContextQuickActions(['delete']);
      document.getElementById('ctxq-reset-btn')?.click();
    });
    const afterReset = await page.evaluate(() =>
      // @ts-expect-error
      [...contextQuickActions]
    );
    expect(afterReset).toEqual(['ai-rewrite', 'note', 'remark', 'qa', 'diagram', 'tags']);
  });

  // "Add diagram..."/"Add question..." used to vanish from both the rendered quick row and the
  // Settings drag-to-reorder list whenever Pad's Diagrams/QA tab happened to be off -- even
  // though they stayed checked in the grid above the list, since the checkbox grid's own state
  // only ever reflects contextQuickActions membership, never the Pad-tab gate. That made the
  // quick row's own settings UI look broken (checked but invisible, with no explanation) and
  // tied a right-click placement decision to an unrelated Pad Panel setting. They should behave
  // exactly like "Add remark...", which was never gated this way: always present wherever the
  // Quick row setting and the 6-icon cap put it, with the feature-off state (if any) surfaced by
  // the action's own click handler instead.
  test('"Add diagram..." and "Add question..." stay in the quick row and its reorder list even when Pad\'s Diagrams/QA tab is off', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    await page.evaluate(() => {
      // @ts-expect-error
      padDiagramsTabEnabled = false; padQaTabEnabled = false;
      // @ts-expect-error
      setContextQuickActions(['diagram', 'qa']);
    });

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });
    await expect(page.locator('#context-quickbar .pv-qm-btn[data-action="diagram"]')).toBeVisible();
    await expect(page.locator('#context-quickbar .pv-qm-btn[data-action="qa"]')).toBeVisible();

    const orderListKeys = await page.evaluate(() => {
      // @ts-expect-error
      renderContextQuickOrderList();
      return [...document.querySelectorAll('#ctx-quickbar-order-list [data-key]')].map(el => (el as HTMLElement).dataset.key);
    });
    expect(orderListKeys).toEqual(['diagram', 'qa']);
  });
});
