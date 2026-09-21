import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// This is the highest-risk generated block: it replaces index.html's core tree-query functions
// (getIndex, getSubtreeEnd, buildPrefix, buildVertFlags, isIdSelected, getSelectionRangeIds,
// etc.) AND rewrites all 268 real call sites to the new explicit-argument signatures in the
// same commit — including a genuine positional-argument REORDER for buildPrefix/buildVertFlags
// (scopedNodes moved from a trailing optional param to a required leading one), not just an
// append. This test exercises that rendering path against the real DOM with a real multi-depth
// tree, in both tree-line rendering modes (buildPrefix vs buildVertFlags), plus collapse/expand
// (getSubtreeEnd/countDescendants), focus mode (getIndex/getParentIndex), and range selection
// (getSelectionRangeIds/getVisibleNodeIndexes/isIdSelected) — not just "did it throw".
test.describe('generated nodeQueries block (src/core/nodeQueries.ts spliced into index.html)', () => {
  test('tree render, collapse/expand, focus mode, and range selection all work against a real multi-depth tree', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

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

    // Build a real 5-node tree directly (bare top-level `let`s, same technique the admin/vault
    // smoke tests use for their own module's state): A(depth0) > A1(depth1) > A1a(depth2),
    // A(depth0) > A2(depth1), B(depth0). Exercises getSubtreeEnd/nodeHasChildren/getIndex over
    // real parent/child/sibling relationships, not a flat or single-node list.
    const rowCountAfterBuild = await page.evaluate(() => {
      // @ts-expect-error — bare global from index.html
      nodes = [
        { id: 1, depth: 0, text: 'A', styles: {} },
        { id: 2, depth: 1, text: 'A1', styles: {} },
        { id: 3, depth: 2, text: 'A1a', styles: {} },
        { id: 4, depth: 1, text: 'A2', styles: {} },
        { id: 5, depth: 0, text: 'B', styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 1;
      // @ts-expect-error
      multiSelectedIds = [];
      // @ts-expect-error
      selectAllMode = false;
      // @ts-expect-error
      focusedId = null;
      // @ts-expect-error
      render();
      return document.querySelectorAll('.node-row').length;
    });
    expect(rowCountAfterBuild).toBe(5);

    // hideTreeLines=false forces the ASCII-connector path (buildPrefix), the one whose call
    // sites needed a real positional reorder, not just an appended arg.
    const asciiPrefixes = await page.evaluate(() => {
      // @ts-expect-error
      hideTreeLines = false;
      // @ts-expect-error
      render();
      return Array.from(document.querySelectorAll('.node-row')).map(
        (row) => row.querySelector('.node-conn')?.textContent ?? ''
      );
    });
    // A1 and A2 are A's children; A1 has a later sibling (A2) so gets '├', A2 is the last child
    // so gets '└'. A1a is A1's only child (no siblings) so also gets '└'. Root-depth nodes (A, B)
    // have no connector at all (no .node-conn span rendered). This is exactly the
    // tree-shape-dependent output buildPrefix computes via hasLaterSiblingAtDepth — a real
    // behavioral check, not just "didn't crash". (treeIndentWidth defaults to 3, so the dash
    // run is 1 character: Math.max(1, 3-2).)
    expect(asciiPrefixes).toEqual(['', '├─ ', '└─ ', '└─ ', '']);

    // hideTreeLines=true forces the pixel-grid path (buildVertFlags) — the other reordered
    // function — and exercises the fold-badge count (countDescendants/getSubtreeEnd) via a real
    // collapse.
    const afterCollapse = await page.evaluate(() => {
      // @ts-expect-error
      hideTreeLines = true;
      // @ts-expect-error
      toggleCollapse(1); // collapse node A — hides A1 and A1a
      const rows = Array.from(document.querySelectorAll('.node-row')).map(
        (el) => (el as HTMLElement).dataset.id
      );
      const badge = document.querySelector('.node-row[data-id="1"] .fold-badge')?.textContent;
      return { rows, badge };
    });
    // Depths [0,1,2,1,0] mean A2 (depth 1) is still inside A's subtree — any depth greater than
    // the root's depth counts as nested until depth drops back to <= the root's own depth — so
    // A's full subtree is A1, A1a, AND A2 (3 descendants), not just A1/A1a. Collapsing A hides
    // all three, leaving only A and B. This is exactly getSubtreeEnd's own depth-scan logic.
    expect(afterCollapse.rows).toEqual(['1', '5']); // A1, A1a, A2 hidden; only A, B visible
    expect(afterCollapse.badge).toBe('+3'); // countDescendants(nodes, 0) === 3

    // Expand back, then enter focus mode on A1 (getIndex + getParentIndex power both the
    // zoom-in itself and the breadcrumb trail back out).
    const focusResult = await page.evaluate(() => {
      // @ts-expect-error
      expandNode(1);
      // @ts-expect-error
      enterFocus(2); // focus on A1 — should show only A1 and its descendant A1a
      const rows = Array.from(document.querySelectorAll('.node-row')).map(
        (el) => (el as HTMLElement).dataset.id
      );
      // @ts-expect-error
      const breadcrumb = getFocusBreadcrumb().map((c: { id: number }) => c.id);
      return { rows, breadcrumb };
    });
    // Focus mode renders the focused node's DESCENDANTS only (idx > focusIdx and < focusEnd) —
    // the focused node itself becomes the implicit "root" of the zoomed view, shown via the
    // breadcrumb rather than as its own row, matching Workflowy-style zoom. So focusing A1
    // shows only A1a, not A1 itself.
    expect(focusResult.rows).toEqual(['3']);
    expect(focusResult.breadcrumb).toEqual([1, 2]); // A -> A1, via getParentIndex walking up

    // Exit focus, then a range selection from A to A2 (getSelectionRangeIds, which itself calls
    // getIndex and getVisibleNodeIndexes) should select A, A1, A1a, A2 but not B.
    const selectionResult = await page.evaluate(() => {
      // @ts-expect-error
      exitFocus();
      // @ts-expect-error
      const range = getSelectionRangeIds(nodes, collapsedIds, 1, 4);
      // @ts-expect-error
      multiSelectedIds = range;
      // @ts-expect-error
      render();
      const selectedIds = Array.from(document.querySelectorAll('.node-row.selected')).map(
        (el) => (el as HTMLElement).dataset.id
      );
      return { range, selectedIds };
    });
    expect(selectionResult.range).toEqual([1, 2, 3, 4]);
    expect(selectionResult.selectedIds.sort()).toEqual(['1', '2', '3', '4']); // isIdSelected per row

    expect(unexpectedErrors).toEqual([]);
  });
});
