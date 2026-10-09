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

// A folded branch used to render one small icon PER content type found anywhere inside it
// (note/decision-log/diagram/file/remark/meeting/todo/qa/marker) -- up to 8+ distinct
// dots could stack on a single collapsed row. First consolidated to one separate generic dot
// next to the existing +N fold-badge; that was still two floating elements with a gap between
// them for what's really one signal. Folded a step further: a tiny dot now prefixes the +N
// badge itself (inheriting the badge's own muted color via currentColor) only when there's
// something to report, and the badge's own tooltip names what's inside -- exactly one element
// per folded row, never two. Own-node dots (this node itself has X) are unaffected by any of
// this, and separately now use a distinct color per content type instead of all sharing
// --accent, so they're distinguishable from each other without needing the tooltip.
test.describe('Folded-branch content indicators are consolidated into the +N badge', () => {
  test('a folded node with no own note but a descendant note gets a dot-prefixed badge, mentioning the note in its tooltip', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child with a note', styles: {}, note: 'a descendant note' },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badge = row.querySelector('.fold-badge')!;
      return { hasDot: !!badge.querySelector('.fold-badge-dot'), tip: badge.getAttribute('data-tip') || '' };
    });

    expect(result.hasDot).toBe(true);
    expect(result.tip).toContain('a note');
  });

  test('a folded node with no hidden content beyond its children gets a plain badge, no dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent, nothing special', styles: {} },
        { id: 2, depth: 1, text: 'Plain child', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badge = row.querySelector('.fold-badge')!;
      return { hasDot: !!badge.querySelector('.fold-badge-dot'), tip: badge.getAttribute('data-tip') || '' };
    });

    expect(result.hasDot).toBe(false);
    expect(result.tip).not.toContain('contains');
  });

  // The diagram subtree check is deliberately skipped when the folded node already has its own
  // diagram (pre-existing guard, !diagrams.some(dg=>dg.anchorNodeId===node.id)) -- the own-node
  // diagram dot already covers "there's a diagram here", so a hidden descendant's diagram isn't
  // separately surfaced in this one case. Still true after consolidation.
  test('a folded node with its own diagram AND a descendant diagram: the own-diagram dot shows, the badge gets no dot for it', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent with its own diagram', styles: {} },
        { id: 2, depth: 1, text: 'Child with a diagram too', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      diagrams = [
        { id: 'd1', anchorNodeId: 1, title: 'Own diagram' },
        { id: 'd2', anchorNodeId: 2, title: 'Child diagram' },
      ];
      // @ts-expect-error
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badge = row.querySelector('.fold-badge')!;
      return {
        ownDiagramDots: row.querySelectorAll('.node-diagram-dot').length,
        badgeHasDot: !!badge.querySelector('.fold-badge-dot'),
      };
    });

    expect(result.ownDiagramDots).toBe(1);
    expect(result.badgeHasDot).toBe(false);
  });

  test('several distinct hidden content types in one folded branch produce one dot-prefixed badge, tooltip listing all of them', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent', styles: {} },
        { id: 2, depth: 1, text: 'Child with a note', styles: {}, note: 'a note' },
        { id: 3, depth: 1, text: 'Child with a diagram', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      diagrams = [{ id: 'd3', anchorNodeId: 3, title: 'Child diagram' }];
      // @ts-expect-error
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const badges = row.querySelectorAll('.fold-badge');
      return { count: badges.length, tip: badges[0]?.getAttribute('data-tip') || '' };
    });

    expect(result.count).toBe(1); // exactly one badge, as always
    expect(result.tip).toContain('a note');
    expect(result.tip).toContain('a diagram');
  });

  // Own-node dots each carry a distinct color (so note/diagram/qa/etc. are tellable apart at a
  // glance without reading the tooltip) -- unaffected by the folded-badge consolidation above.
  test('own-node dots use distinct colors per type', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Own note + own Q&A', styles: {}, note: 'a note' },
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      qaItems = [{ id: 'q1', sourceNodeId: 1, question: 'Q', answer: 'A' }];
      // @ts-expect-error
      padQaTabEnabled = true;
      // @ts-expect-error
      render();

      const row = document.querySelector('.node-row[data-id="1"]')!;
      const ownNoteDot = row.querySelector('.node-note-dot:not(.node-qa-dot)')!;
      const ownQaDot = row.querySelector('.node-qa-dot')!;
      return {
        ownNoteColor: getComputedStyle(ownNoteDot).color,
        ownQaColor: getComputedStyle(ownQaDot).color,
      };
    });

    expect(result.ownNoteColor).not.toBe(result.ownQaColor); // distinct types, distinct colors
  });
});
