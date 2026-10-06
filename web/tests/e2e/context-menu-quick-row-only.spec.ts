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
});
