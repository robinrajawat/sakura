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
    diagrams = [];
    // @ts-expect-error
    render();
  });
}

// "Add diagram..." reuses the same CTX_ACTION_META/CTX_ACTION_ORDER machinery notes/remarks/Q&A
// already use for the right-click menu's quick row and its "More" panel -- it was simply missing
// from that list. These tests cover both surfaces.
test.describe('Right-click "Add diagram..." quick action', () => {
  test('is offered in the quick row by default and creates a diagram anchored to the node', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);
    await seedOneNode(page);

    const row = page.locator('.node-row[data-id="1"]');
    await row.click({ button: 'right' });

    const diagramBtn = page.locator('#context-quickbar .pv-qm-btn[data-action="diagram"]');
    await expect(diagramBtn).toBeVisible();

    await diagramBtn.click();

    await expect(page.locator('#diagram-editor-overlay')).toHaveClass(/open/);
    // @ts-expect-error
    const anchor = await page.evaluate(() => diagrams[0]?.anchorNodeId);
    expect(anchor).toBe(1);
  });
});
