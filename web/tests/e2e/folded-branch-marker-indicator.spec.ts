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

// Node markers feed into the same consolidated +N fold-badge as every other content type (see
// folded-branch-indicator-standard.spec.ts): a dot prefixes the badge when a hidden descendant
// carries a marker, and the badge's own tooltip names which marker type and how many, rather
// than a dedicated color-coded dot of its own.
test.describe('Folded-branch node-marker indicator feeds the consolidated fold-badge', () => {
  test('a folded node with no own marker but a descendant marker mentions it in the badge tooltip', async ({ page }) => {
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
      const badge = row.querySelector('.fold-badge')!;
      return { open: badge.classList.contains('fold-badge-open'), text: badge.textContent, tip: badge.getAttribute('data-tip') || '' };
    });

    // Owner, 2026-10-20: the badge is just the count; what is inside is in its tooltip.
    expect(result.text).toBe('+1');
    expect(result.open).toBe(false);
    expect(result.tip).toContain('marked Agreed');
  });

  test('a folded node whose own marker matches its descendant\'s marker type gets no dot for it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
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
      const badge = row.querySelector('.fold-badge')!;
      return badge.getAttribute('data-tip') || '';
    });

    expect(result).not.toContain('marked');
  });

  test('a folded node\'s own marker badge and a differently-typed descendant marker both show, as distinct indicators', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent, own confirmed', styles: {}, marker: 'confirmed' },
        { id: 2, depth: 1, text: 'Child marked follow-up', styles: {}, marker: 'followup' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badge = row.querySelector('.fold-badge')!;
      return {
        ownBadgeShown: !!row.querySelector('.node-marker-badge'),
        fold: { open: badge.classList.contains('fold-badge-open'), text: badge.textContent, tip: badge.getAttribute('data-tip') || '' },
      };
    });

    expect(result.ownBadgeShown).toBe(true);
    // Hidden follow-ups turn the count accent-coloured and are counted in the tooltip.
    expect(result.fold.open).toBe(true);
    expect(result.fold.text).toBe('+1');
    expect(result.fold.tip).toContain('1 follow-up');
  });

  test('several distinct marker types hidden in the subtree are all named in one shared tooltip', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child A', styles: {}, marker: 'followup' },
        { id: 3, depth: 1, text: 'Child B', styles: {}, marker: 'followup' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badges = row.querySelectorAll('.fold-badge');
      return { count: badges.length, tip: badges[0]?.getAttribute('data-tip') || '' };
    });

    expect(result.count).toBe(1); // one badge total, not one per marker type
    expect(result.tip).toContain('2 follow-ups');
  });

  test('the badge tooltip counts how many hidden descendants carry that marker type', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child A', styles: {}, marker: 'followup' },
        { id: 3, depth: 1, text: 'Child B', styles: {}, marker: 'followup' },
        { id: 4, depth: 1, text: 'Child C', styles: {}, marker: 'followup' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badge = row.querySelector('.fold-badge') as HTMLElement;
      return badge.dataset.tip;
    });

    expect(result).toBe('Click to expand · 3 hidden rows — 3 follow-ups');
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
      const badge = row.querySelector('.fold-badge') as HTMLElement;
      return badge.dataset.tip;
    });

    expect(result).toBe('Click to expand · 1 hidden row — contains 1 row marked Agreed');
  });

  test('an expanded node (not folded) never shows a fold-badge, even with a marked child', async ({ page }) => {
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
      return !!row.querySelector('.fold-badge');
    });

    expect(found).toBe(false);
  });
});
