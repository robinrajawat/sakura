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
// (note/decision-log/diagram/file/remark/meeting/todo/qa/mindmap/marker) -- up to 9+ distinct
// dots could stack on a single collapsed row, each its own shape, a few px apart, none more
// than a vague "something's here" signal once there were more than one or two. Consolidated to
// a single generic dot per folded row: its tooltip lists what's actually inside (comma-
// separated), and the existing +N fold-badge still gives the hidden-node count. Own-node dots
// (this node itself has X) are unaffected by that change, and separately now use a distinct
// color per content type instead of all sharing --accent, so they're distinguishable from each
// other without needing the tooltip.
test.describe('Folded-branch content indicators are consolidated into one dot', () => {
  test('a folded node with no own note but a descendant note shows the subtree dot, mentioning the note in its tooltip', async ({ page }) => {
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
      const dot = row.querySelector('.node-subtree-dot');
      return { found: !!dot, tip: dot?.getAttribute('data-tip') || '' };
    });

    expect(result.found).toBe(true);
    expect(result.tip).toContain('a note');
  });

  // The diagram subtree check is deliberately skipped when the folded node already has its own
  // diagram (pre-existing guard, !diagrams.some(dg=>dg.anchorNodeId===node.id)) -- the own-node
  // diagram dot already covers "there's a diagram here", so a hidden descendant's diagram isn't
  // separately surfaced in this one case. Still true after consolidation, since the suppression
  // happens before anything reaches the shared subtreeKinds list.
  test('a folded node with its own diagram AND a descendant diagram: the own-diagram dot shows, the descendant one is not separately called out', async ({ page }) => {
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
      return {
        ownDiagramDots: row.querySelectorAll('.node-diagram-dot').length,
        subtreeDots: row.querySelectorAll('.node-subtree-dot').length,
      };
    });

    expect(result.ownDiagramDots).toBe(1);
    expect(result.subtreeDots).toBe(0);
  });

  test('several distinct hidden content types in one folded branch still produce exactly one subtree dot, listing all of them', async ({ page }) => {
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
      const dots = row.querySelectorAll('.node-subtree-dot');
      return { count: dots.length, tip: dots[0]?.getAttribute('data-tip') || '' };
    });

    expect(result.count).toBe(1);
    expect(result.tip).toContain('a note');
    expect(result.tip).toContain('a diagram');
  });

  // Own-node dots now each carry a distinct color (so note/diagram/qa/etc. are tellable apart
  // at a glance), while the subtree dot stays a single plain, muted indicator -- deliberately
  // not colorful, since it no longer distinguishes content type itself (the tooltip does that).
  test('own-node dots use distinct colors per type; the subtree dot stays a single muted indicator', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const result = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Own note + own Q&A', styles: {}, note: 'a note' },
        { id: 2, depth: 1, text: 'Child with a diagram', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      qaItems = [{ id: 'q1', sourceNodeId: 1, question: 'Q', answer: 'A' }];
      // @ts-expect-error
      padQaTabEnabled = true;
      // @ts-expect-error
      diagrams = [{ id: 'd2', anchorNodeId: 2, title: 'Child diagram' }];
      // @ts-expect-error
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      render();

      const row = document.querySelector('.node-row[data-id="1"]')!;
      const ownNoteDot = row.querySelector('.node-note-dot:not(.node-qa-dot)')!;
      const ownQaDot = row.querySelector('.node-qa-dot')!;
      const subtreeDot = row.querySelector('.node-subtree-dot')!;
      return {
        ownNoteColor: getComputedStyle(ownNoteDot).color,
        ownQaColor: getComputedStyle(ownQaDot).color,
        subtreeColor: getComputedStyle(subtreeDot).color,
      };
    });

    expect(result.ownNoteColor).not.toBe(result.ownQaColor); // distinct types, distinct colors
    expect(result.subtreeColor).not.toBe(result.ownNoteColor);
    expect(result.subtreeColor).not.toBe(result.ownQaColor);
  });
});
