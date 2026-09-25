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

// A folded node is supposed to surface, via a small dot, every content type a hidden descendant
// carries (diagram, file, remark, meeting/todo/Q&A ref, mind-map ref, decision log) -- but notes
// were the one type with no `subtreeHasX()` check wired into that indicator row, so a folded
// branch whose only content was a plain node.note showed nothing. Separately, none of the eight
// types (mind-map being the sole exception) guarded against showing the SAME icon twice when the
// folded node itself also carried that same content type as one of its hidden descendants --
// e.g. a folded node with its own diagram AND a child diagram showed two identical diagram dots
// side by side, with only the tooltip text distinguishing "this node has" from "this branch
// contains".
test.describe('Folded-branch content indicators follow one standard: every type covered, no duplicate icons', () => {
  test('a folded node with no own note but a descendant note shows the new note-subtree dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const shown = await page.evaluate(() => {
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
      return !!row.querySelector('.node-note-subtree-dot');
    });

    expect(shown).toBe(true);
  });

  test('a folded node with its own diagram AND a descendant diagram shows only one diagram dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const count = await page.evaluate(() => {
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
      return row.querySelectorAll('.node-diagram-dot').length;
    });

    expect(count).toBe(1);
  });

  test('the normal case is unaffected: a folded node with no own diagram but a descendant one still shows exactly one dot', async ({ page }) => {
    await page.goto('file://' + indexPath);
    await dismissOverlays(page);

    const count = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'Folded parent, no own diagram', styles: {} },
        { id: 2, depth: 1, text: 'Child with a diagram', styles: {} },
      ];
      // @ts-expect-error
      collapsedIds = new Set([1]);
      // @ts-expect-error
      selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null;
      // @ts-expect-error
      diagrams = [{ id: 'd2', anchorNodeId: 2, title: 'Child diagram' }];
      // @ts-expect-error
      padDiagramsTabEnabled = true;
      // @ts-expect-error
      render();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      return row.querySelectorAll('.node-diagram-dot').length;
    });

    expect(count).toBe(1);
  });

  // Own-node dots (this node has X) are meant to read as colorful/accented, distinct from
  // subtree dots (a hidden descendant has X), which stay muted green -- but only 4 of 9 own-dot
  // types (decision log, diagram, file, remark) actually set an accent color; note, meeting ref,
  // todo ref, Q&A ref, and mind-map ref left color unset, falling back to the same neutral tone
  // as everything else. Every own-dot type now explicitly sets --accent so the own-vs-subtree
  // color split is actually true, not true for 4 out of 9 types.
  test('own-node dots (note, Q&A) are accent-colored; subtree dots stay muted green', async ({ page }) => {
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

      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
      const row = document.querySelector('.node-row[data-id="1"]')!;
      const ownNoteDot = row.querySelector('.node-note-dot:not(.node-qa-dot)')!;
      const ownQaDot = row.querySelector('.node-qa-dot')!;
      const subtreeDiagramDot = row.querySelector('.node-diagram-dot')!;
      return {
        accent,
        ownNoteColor: getComputedStyle(ownNoteDot).color,
        ownQaColor: getComputedStyle(ownQaDot).color,
        subtreeDiagramColor: getComputedStyle(subtreeDiagramDot).color,
      };
    });

    const toRgb = (hex: string) => {
      const m = hex.replace('#', '');
      const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
      return `rgb(${r}, ${g}, ${b})`;
    };
    expect(result.ownNoteColor).toBe(toRgb(result.accent));
    expect(result.ownQaColor).toBe(toRgb(result.accent));
    expect(result.subtreeDiagramColor).not.toBe(toRgb(result.accent));
  });
});
