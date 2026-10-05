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

// The fold dot already feeds into the generic node-timestamp hover tooltip (TIMESTAMP_SEL
// includes .fold-dot), which shows the node's created/last-edited timestamps instead of
// whatever static data-tip the element carries, whenever "Timestamps on hover" is on (the
// default). The dot's own data-tip used to be 'Expand subtree'/'Collapse subtree' -- dead text
// in the common case, since the timestamp tooltip always wins over it -- but still surfaced as a
// fallback whenever a user explicitly turned timestamps-on-hover off. Removed per feedback: fold/
// collapse is self-evident from the dot's own state, no need to spell it out either way.
test.describe('Fold dot tooltip is the node timestamp, never "Expand/Collapse subtree"', () => {
  test('hovering the fold dot shows the node timestamp by default', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Parent', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, createdAt: Date.now() - 100000, modifiedAt: Date.now() - 5000 },
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

    const dot = page.locator('.node-row[data-id="1"] .fold-dot');
    expect(await dot.getAttribute('data-tip')).toBeNull();

    const box = (await dot.boundingBox())!;
    await page.mouse.move(5, 5);
    await page.mouse.move(box.x + 3, box.y + 3, { steps: 5 });
    await expect(page.locator('#node-timestamp-tip')).toHaveClass(/visible/);
    const tipText = await page.locator('#node-timestamp-tip').textContent();
    expect(tipText).toContain('Created at');
    expect(tipText).toContain('Last edited at');
    expect(tipText).not.toContain('Expand');
    expect(tipText).not.toContain('Collapse');
  });

  test('with "Timestamps on hover" turned off, the fold dot shows no tooltip at all, not "Expand/Collapse subtree"', async ({ page }) => {
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
      setNodeTimestampHoverEnabled(false, false);
      // @ts-expect-error
      render();
    });

    const dot = page.locator('.node-row[data-id="1"] .fold-dot');
    const box = (await dot.boundingBox())!;
    await page.mouse.move(5, 5);
    await page.mouse.move(box.x + 3, box.y + 3, { steps: 5 });
    await page.waitForTimeout(150);
    await expect(page.locator('#node-timestamp-tip')).not.toHaveClass(/visible/);
  });
});
