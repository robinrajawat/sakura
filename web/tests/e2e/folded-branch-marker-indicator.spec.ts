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

// Node markers used to get their own color-coded subtree dot (node-marker-subtree-dot),
// separate from the other eight content types' own subtree dots -- one more icon stacking onto
// an already-crowded folded row. Markers now feed into the same single consolidated
// .node-subtree-dot as everything else (see folded-branch-indicator-standard.spec.ts): the
// tooltip names which marker type and how many, rather than a dedicated colored dot.
test.describe('Folded-branch node-marker indicator feeds the consolidated subtree dot', () => {
  test('a folded node with no own marker but a descendant marker mentions it in the subtree dot tooltip', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child marked confirmed', styles: {}, marker: 'confirmed' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const dot = row.querySelector('.node-subtree-dot');
      return { found: !!dot, tip: dot?.getAttribute('data-tip') || '' };
    });

    expect(result.found).toBe(true);
    expect(result.tip).toContain('marked Confirmed');
  });

  test('a folded node whose own marker matches its descendant\'s marker type shows no subtree dot for it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const found = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent, own confirmed', styles: {}, marker: 'confirmed' },
        { id: 2, depth: 1, text: 'Child also confirmed', styles: {}, marker: 'confirmed' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      return !!row.querySelector('.node-subtree-dot'); // nothing else hidden, so no dot at all
    });

    expect(found).toBe(false);
  });

  test('a folded node\'s own marker badge and a differently-typed descendant marker both show, as distinct indicators', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent, own confirmed', styles: {}, marker: 'confirmed' },
        { id: 2, depth: 1, text: 'Child marked issue', styles: {}, marker: 'issue' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const dot = row.querySelector('.node-subtree-dot');
      return {
        ownBadgeShown: !!row.querySelector('.node-marker-badge'),
        subtreeTip: dot?.getAttribute('data-tip') || '',
      };
    });

    expect(result.ownBadgeShown).toBe(true);
    expect(result.subtreeTip).toContain('marked Issue');
  });

  test('several distinct marker types hidden in the subtree are all named in one shared tooltip', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child A', styles: {}, marker: 'issue' },
        { id: 3, depth: 1, text: 'Child B', styles: {}, marker: 'followup' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const dots = row.querySelectorAll('.node-subtree-dot');
      return { count: dots.length, tip: dots[0]?.getAttribute('data-tip') || '' };
    });

    expect(result.count).toBe(1); // one dot total, not one per marker type
    expect(result.tip).toContain('marked Issue');
    expect(result.tip).toContain('marked Follow-up');
  });

  test('the subtree dot tooltip counts how many hidden descendants carry that marker type', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child A', styles: {}, marker: 'issue' },
        { id: 3, depth: 1, text: 'Child B', styles: {}, marker: 'issue' },
        { id: 4, depth: 1, text: 'Child C', styles: {}, marker: 'issue' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const dot = row.querySelector('.node-subtree-dot') as HTMLElement;
      return dot.dataset.tip;
    });

    expect(result).toBe('This collapsed branch contains 3 nodes marked Issue');
  });

  test('a single hidden descendant with a marker gets singular tooltip wording, not "1 nodes"', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child marked confirmed', styles: {}, marker: 'confirmed' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const dot = row.querySelector('.node-subtree-dot') as HTMLElement;
      return dot.dataset.tip;
    });

    expect(result).toBe('This collapsed branch contains 1 node marked Confirmed');
  });

  test('an expanded node (not folded) never shows a subtree dot, even with a marked child', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const found = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Expanded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child marked confirmed', styles: {}, marker: 'confirmed' },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      return !!row.querySelector('.node-subtree-dot');
    });

    expect(found).toBe(false);
  });
});
