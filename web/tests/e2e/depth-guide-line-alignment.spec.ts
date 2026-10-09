import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Regression test: the depth guide lines (.node-vguide) are drawn at a fixed pixel offset per
// indent level, which must track wherever the leading dot/fold-icon column actually sits -- any
// change to what comes before it in the row (e.g. removing the separate drag-handle icon in favor
// of a long-press-anywhere drag gesture) shifts that column and needs the guide offset updated to
// match, or every guide line renders off to one side of the dot column it's supposed to run
// through instead of passing straight through each ancestor's dot center as intended.
test.describe('Depth guide lines stay aligned with each ancestor\'s dot center', () => {
  test('a depth guide line at column d sits exactly on the x-center of a dot at that same depth', async ({ page }) => {
    await page.goto('file://' + indexPath);
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

    const result = await page.evaluate(() => {
      // A(depth0) > A1(depth1) > A1a/A1b(depth2), A > A2(depth1), B(depth0) -- gives a depth-2
      // row two guide lines (for the depth-0 and depth-1 ancestor columns) to check at once.
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'A', styles: {} },
        { id: 2, depth: 1, text: 'A1', styles: {} },
        { id: 3, depth: 2, text: 'A1a', styles: {} },
        { id: 4, depth: 2, text: 'A1b', styles: {} },
        { id: 5, depth: 1, text: 'A2', styles: {} },
        { id: 6, depth: 0, text: 'B', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();

      const dotCenterX = (id: number) => {
        const row = document.querySelector(`.node-row[data-id="${id}"]`)!;
        const dot = row.querySelector('.node-dot, .fold-dot')!;
        const r = dot.getBoundingClientRect();
        return (r.left + r.right) / 2 - row.getBoundingClientRect().left;
      };
      const guideLefts = (id: number) => {
        const row = document.querySelector(`.node-row[data-id="${id}"]`)!;
        return Array.from(row.querySelectorAll('.node-vguide')).map(
          (vg) => vg.getBoundingClientRect().left - row.getBoundingClientRect().left
        );
      };

      return {
        depth0DotCenter: dotCenterX(1), // "A"
        depth1DotCenter: dotCenterX(2), // "A1"
        a1aGuides: guideLefts(3), // "A1a" -- one guide for depth 0, one for depth 1
      };
    });

    expect(result.a1aGuides).toHaveLength(2);
    // Guide column 0 must sit exactly on the depth-0 row's own dot center, and column 1 on the
    // depth-1 row's -- i.e. each guide runs straight down through its ancestor's marker, not
    // offset to one side of it (the drag handle used to throw this off by ~13.75px).
    expect(result.a1aGuides[0]).toBeCloseTo(result.depth0DotCenter, 1);
    expect(result.a1aGuides[1]).toBeCloseTo(result.depth1DotCenter, 1);
  });

  // A table/chart/Cards object renders in its own .node-table-line-wrap block between two rows,
  // same as a note/remark/Q&A/diagram's own inline block does -- every one of those already
  // redraws the guide line through its own height so the line down the page doesn't visibly break
  // at a row with inline content, except node.tables' own wrap never did.
  test('the depth guide line continues through a node-table-line-wrap block, not just rows', async ({ page }) => {
    await page.goto('file://' + indexPath);
    const landing = page.locator('#sakura-landing-overlay');
    if (await landing.isVisible().catch(() => false)) {
      await page.evaluate(() => { const el = document.getElementById('sakura-landing-overlay'); if (el) el.style.display = 'none'; });
    }
    const welcome = page.locator('#welcome-overlay');
    if (await welcome.isVisible().catch(() => false)) {
      await page.evaluate(() => document.getElementById('welcome-overlay')?.classList.remove('open'));
    }

    await page.evaluate(() => {
      const tableHtml = '<table><tr><th>Label</th><th>Value</th></tr><tr><td>A</td><td>10</td></tr></table>';
      // A has a later sibling (B) -- the depth-0 guide must run through A1's own table block.
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'A', styles: {} },
        { id: 2, depth: 1, text: 'A1', styles: {}, tables: [tableHtml] },
        { id: 3, depth: 0, text: 'B', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
    });

    const guideCount = await page.evaluate(() => document.querySelectorAll('.node-table-line-wrap .node-vguide').length);
    expect(guideCount).toBeGreaterThan(0);
  });
});
