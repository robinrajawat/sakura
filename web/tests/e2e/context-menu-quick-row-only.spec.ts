import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The welcome modal opens on a ~500ms timer whenever no documents exist yet (these tests seed
// in-memory nodes without creating one), so it could appear mid-test -- after the one-time
// dismissOverlays() check -- and intercept clicks/drags. Marking it as already seen before the
// page loads removes that race for this whole file.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable: nothing to pre-seed */ } });
});

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

// The right-click menu used to have customization settings ("Menu items", then "Quick row") that
// controlled which actions appeared and where. They were removed (item 14): it's now one fixed
// menu -- a quick row of the first 6 allowed actions of CTX_QUICK_ROW, and "More" listing every
// other node action, so nothing that could once be switched on is ever unreachable.
test.describe('Right-click menu is fixed: quick row + "More" with everything else', () => {
  test('no right-click menu settings remain', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    for (const sel of ['#ctx-hidden-field', '#ctx-hidden-header', '[id^="ctxh-"]', '[id^="ctxq-"]', '#rightclick-menu-open-btn', '#rightclick-menu-modal-overlay', '#ctx-quickbar-order-list']) {
      await expect(page.locator(sel), sel).toHaveCount(0);
    }
    const globals = await page.evaluate(() => ['contextQuickActions', 'setContextQuickActions', 'contextSortChildrenEnabled', 'CTX_QUICK_ROW_DEFAULT']
      .filter((n) => typeof (window as unknown as Record<string, unknown>)[n] !== 'undefined'));
    expect(globals).toEqual([]);
  });

  test('the quick row is the first 6 of the fixed set, and "More" lists every other action without duplicates', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });
    const quick = await page.evaluate(() =>
      [...document.querySelectorAll('#context-quickbar .pv-qm-btn')].map((b) => (b as HTMLElement).dataset.action));
    expect(quick).toEqual(['ai-rewrite', 'note', 'remark', 'diagram', 'table', 'image']);

    await page.locator('#context-more-toggle').click();
    // Add-to-node leftovers (diagram-gen, date-time) live behind the Insert › flyout.
    await page.locator('#context-more-panel .context-submenu-trigger[data-flyout="insert"]').hover();
    for (const action of ['child', 'above', 'below', 'duplicate', 'up', 'down', 'diagram-gen', 'date-time', 'delete']) {
      await expect(page.locator(`#context-more-panel [data-action="${action}"]`), action).toBeVisible();
    }
    // Row settings live behind the Row › flyout.
    await page.locator('#context-more-panel .context-submenu-trigger[data-flyout="row"]').hover();
    await expect(page.locator('#context-more-panel [data-action="tags"]')).toBeVisible();
    for (const visibleAction of quick) {
      await expect(page.locator(`#context-more-panel [data-action="${visibleAction}"]`)).toHaveCount(0);
    }
  });

  test('when an action in the quick row is not allowed (AI off), the next one moves up into the row', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => setFeatureEnabled('ai', false, false));

    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    const quick = await page.evaluate(() =>
      [...document.querySelectorAll('#context-quickbar .pv-qm-btn')].map((b) => (b as HTMLElement).dataset.action));
    expect(quick).toEqual(['note', 'remark', 'diagram', 'table', 'image', 'tags']);
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-more-panel [data-action="ai-rewrite"]')).toHaveCount(0);
  });

  async function seedParentWithChild(page: import('@playwright/test').Page) {
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
  }

  test('"Sort children" is always in "More" for a node that has children, and sorts them', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedParentWithChild(page);

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    await expect(page.locator('#context-sort-label')).toBeVisible();
    await expect(page.locator('#context-more-panel [data-action="sort-az"]')).toBeVisible();
  });
});
