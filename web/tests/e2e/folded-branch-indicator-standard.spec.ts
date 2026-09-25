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
});
