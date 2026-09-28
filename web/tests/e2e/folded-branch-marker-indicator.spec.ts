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

// Node markers (confirmed/issue/parked/followup/na) were the one remaining "dot" type with no
// folded-branch indicator: every other content type (note, decision log, diagram, file, remark,
// meeting/todo/Q&A ref, mind-map ref) already surfaces a small dot on a folded parent when a
// hidden descendant carries it, but a marker on a collapsed-away child was invisible until the
// branch was expanded. Unlike the other types, a marker's color is itself meaningful (green
// confirmed vs red issue vs orange follow-up, etc.), so the subtree indicator reuses
// .node-marker-badge's per-type color coding (muted, via node-marker-subtree-dot) rather than a
// single uniform dot color -- distinguishing which marker type is hidden below, not just that
// something is.
test.describe('Folded-branch node-marker indicator', () => {
  test('a folded node with no own marker but a descendant marker shows a subtree dot for that type', async ({ page }) => {
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
      const dot = row.querySelector('.node-marker-subtree-dot');
      return { found: !!dot, color: dot ? (dot as HTMLElement).dataset.color : null };
    });

    expect(result.found).toBe(true);
    expect(result.color).toBe('green');
  });

  test('a folded node whose own marker matches its descendant\'s marker type shows no duplicate dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const count = await page.evaluate(() => {
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
      return row.querySelectorAll('.node-marker-subtree-dot').length;
    });

    expect(count).toBe(0);
  });

  test('a folded node\'s own marker and a differently-typed descendant marker both show, as distinct indicators', async ({ page }) => {
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
      const subtreeDots = Array.from(row.querySelectorAll('.node-marker-subtree-dot')) as HTMLElement[];
      return {
        ownBadgeShown: !!row.querySelector('.node-marker-badge:not(.node-marker-subtree-dot)'),
        subtreeCount: subtreeDots.length,
        subtreeColor: subtreeDots[0]?.dataset.color,
      };
    });

    expect(result.ownBadgeShown).toBe(true);
    expect(result.subtreeCount).toBe(1);
    expect(result.subtreeColor).toBe('red');
  });

  test('several distinct marker types hidden in the subtree each get their own color-coded dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const colors = await page.evaluate(() => {
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
      return Array.from(row.querySelectorAll('.node-marker-subtree-dot')).map(d => (d as HTMLElement).dataset.color).sort();
    });

    expect(colors).toEqual(['orange', 'red']);
  });

  // The tooltip is the only place this count is surfaced -- no visible numeral badge, to stay
  // consistent with every other folded-branch indicator (note/decision log/diagram/etc.), which
  // are all plain presence dots with no count shown on the row itself.
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
      const dot = row.querySelector('.node-marker-subtree-dot') as HTMLElement;
      return dot.dataset.tip;
    });

    expect(result).toBe('This collapsed branch has 3 nodes marked Issue');
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
      const dot = row.querySelector('.node-marker-subtree-dot') as HTMLElement;
      return dot.dataset.tip;
    });

    expect(result).toBe('This collapsed branch has 1 node marked Confirmed');
  });

  test('an expanded node (not folded) never shows a marker subtree dot, even with a marked child', async ({ page }) => {
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
      return !!row.querySelector('.node-marker-subtree-dot');
    });

    expect(found).toBe(false);
  });
});
