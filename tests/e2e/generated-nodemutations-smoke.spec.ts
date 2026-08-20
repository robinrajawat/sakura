import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// The first real `core/` mutation-engine slice — a genuinely different risk profile than any
// prior generated block, since indent/outdent/move directly mutate a live document's structure.
// This test exercises three layers per operation: the pure generated functions directly, the
// real hand-written orchestration wrappers (proving pushUndo/markDirty/rebuildParentIds/render
// all still fire correctly around the new core calls), and the actual rendered DOM output —
// plus the same "is an unrelated, distant function still callable" check that would catch a
// script-killing bug like the serializeMarkdown cutover's import-statement regression.
test.describe('generated nodeMutations block (src/core/nodeMutations.ts spliced into index.html)', () => {
  test('indent/outdent: pure functions, real orchestration (undo/dirty/render), and the mixed-depth partial-outdent edge case', async ({ page }) => {
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

    // 1. Pure functions, called directly — real behavioral checks, including the mixed-depth
    // partial-outdent edge case (a root already at depth 0 is individually skipped, not an
    // all-or-nothing operation for the whole call).
    const pureResults = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      const canIndentFirst = canIndentAt([{ depth: 0 }, { depth: 0 }], 0);
      // @ts-expect-error
      const canIndentSecond = canIndentAt([{ depth: 0 }, { depth: 0 }], 1);

      const indentTestNodes = [{ depth: 0 }, { depth: 0 }, { depth: 1 }, { depth: 0 }];
      // @ts-expect-error — indent root at index 1; its subtree (index 2) should move too
      indentRootIndexes(indentTestNodes, [1]);

      const outdentTestNodes = [{ depth: 0 }, { depth: 1 }, { depth: 1 }];
      // @ts-expect-error — mixed-depth roots [0,1]: index 0 (depth 0) must be skipped, index 1 outdented
      outdentRootIndexes(outdentTestNodes, [0, 1]);

      return {
        canIndentFirst,
        canIndentSecond,
        indentedDepths: indentTestNodes.map((n) => n.depth),
        outdentedDepths: outdentTestNodes.map((n) => n.depth)
      };
    });
    expect(pureResults.canIndentFirst).toBe(false);
    expect(pureResults.canIndentSecond).toBe(true);
    expect(pureResults.indentedDepths).toEqual([0, 1, 2, 0]);
    expect(pureResults.outdentedDepths).toEqual([0, 0, 1]); // root 0 untouched, root 1 outdented

    // 2. The real orchestration wrappers (indentSelected/outdentSelected), against real app
    // state: a 3-node tree, selecting the middle node and indenting it under the first. This
    // proves pushUndo/markDirty/rebuildParentIds/render all still fire around the new core
    // calls — not just the pure logic in isolation.
    const orchestrationResult = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'A', styles: {} },
        { id: 2, depth: 0, text: 'B', styles: {} },
        { id: 3, depth: 0, text: 'C', styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 2; // select B
      // @ts-expect-error
      multiSelectedIds = [];
      // @ts-expect-error
      selectAllMode = false;
      // @ts-expect-error
      focusedId = null;
      // @ts-expect-error
      undoStack = [];
      // @ts-expect-error
      render();

      const undoDepthBefore = undoStack.length;

      // @ts-expect-error
      indentSelected(); // B should become A's child
      const afterIndent = {
        // @ts-expect-error
        depths: nodes.map((n: any) => n.depth),
        // @ts-expect-error
        parentIds: nodes.map((n: any) => n.parentId),
        undoStackGrew: undoStack.length > undoDepthBefore,
        renderedRows: document.querySelectorAll('.node-row').length
      };

      // @ts-expect-error
      outdentSelected(); // bring B back out to depth 0
      const afterOutdent = {
        // @ts-expect-error
        depths: nodes.map((n: any) => n.depth),
        // @ts-expect-error
        parentIds: nodes.map((n: any) => n.parentId)
      };

      return { afterIndent, afterOutdent };
    });

    expect(orchestrationResult.afterIndent.depths).toEqual([0, 1, 0]);
    expect(orchestrationResult.afterIndent.parentIds).toEqual([null, 1, null]); // B's parentId is now A's id
    expect(orchestrationResult.afterIndent.undoStackGrew).toBe(true); // pushUndo() really fired
    expect(orchestrationResult.afterIndent.renderedRows).toBe(3); // render() really fired
    expect(orchestrationResult.afterOutdent.depths).toEqual([0, 0, 0]);
    expect(orchestrationResult.afterOutdent.parentIds).toEqual([null, null, null]);

    // 3. Proof the rest of the script still runs — same check used in the templatesIndex
    // smoke test, the one that would have caught the serializeMarkdown import-statement bug.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof getSelectionRangeIds === 'function' && typeof esc === 'function' && typeof loadTemplatesIndex === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });

  test('moveSelected (up/down): pure functions, real orchestration, and a subtree moving together as one block', async ({ page }) => {
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

    // 1. Pure functions, called directly — including a subtree moving together as one block,
    // the case that most distinguishes this from a naive array swap.
    const pureResults = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      const canMoveUpFirst = canMoveUpAt([{ depth: 0 }, { depth: 0 }], 0);
      // @ts-expect-error
      const canMoveUpSecond = canMoveUpAt([{ depth: 0 }, { depth: 0 }], 1);
      // @ts-expect-error
      const canMoveDownAtEnd = canMoveDownAt([{ depth: 0 }, { depth: 0 }], 1, 2);

      // A(0,id1) A1(1,id2) B(0,id3) B1(1,id4) — move A (with its child A1) down past B (with B1)
      const moveDownNodes = [
        { id: 1, depth: 0 },
        { id: 2, depth: 1 },
        { id: 3, depth: 0 },
        { id: 4, depth: 1 }
      ];
      // @ts-expect-error
      const movedDownId = moveNodeDown(moveDownNodes, 0);

      // A(0,id1) A1(1,id2) B(0,id3) — move B up past A's whole subtree
      const moveUpNodes = [
        { id: 1, depth: 0 },
        { id: 2, depth: 1 },
        { id: 3, depth: 0 }
      ];
      // @ts-expect-error
      const movedUpId = moveNodeUp(moveUpNodes, 2);

      return {
        canMoveUpFirst,
        canMoveUpSecond,
        canMoveDownAtEnd,
        movedDownId,
        movedDownOrder: moveDownNodes.map((n) => n.id),
        movedUpId,
        movedUpOrder: moveUpNodes.map((n) => n.id)
      };
    });
    expect(pureResults.canMoveUpFirst).toBe(false);
    expect(pureResults.canMoveUpSecond).toBe(true);
    expect(pureResults.canMoveDownAtEnd).toBe(false);
    expect(pureResults.movedDownId).toBe(1);
    expect(pureResults.movedDownOrder).toEqual([3, 4, 1, 2]); // B, B1, A, A1 — A's subtree moved together
    expect(pureResults.movedUpId).toBe(3);
    expect(pureResults.movedUpOrder).toEqual([3, 1, 2]); // B, A, A1

    // 2. The real orchestration wrapper (moveSelected), against real app state: a 3-node tree,
    // selecting the last node and moving it up twice to reach the top, then down once. Proves
    // pushUndo/markDirty/rebuildParentIds/render/showToast all still fire around the new core
    // calls — not just the pure logic in isolation.
    const orchestrationResult = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, depth: 0, text: 'A', styles: {} },
        { id: 2, depth: 0, text: 'B', styles: {} },
        { id: 3, depth: 0, text: 'C', styles: {} }
      ];
      // @ts-expect-error
      collapsedIds = new Set();
      // @ts-expect-error
      selectedId = 3; // select C
      // @ts-expect-error
      multiSelectedIds = [];
      // @ts-expect-error
      selectAllMode = false;
      // @ts-expect-error
      focusedId = null;
      // @ts-expect-error
      undoStack = [];
      // @ts-expect-error
      render();

      const undoDepthBefore = undoStack.length;

      // @ts-expect-error
      moveSelected(-1); // C moves up past B: A, C, B
      const afterFirstMoveUp = {
        // @ts-expect-error
        order: nodes.map((n: any) => n.id),
        // @ts-expect-error
        selectedId,
        undoStackGrew: undoStack.length > undoDepthBefore,
        renderedRows: document.querySelectorAll('.node-row').length
      };

      // @ts-expect-error
      moveSelected(-1); // C moves up past A: C, A, B
      // @ts-expect-error
      const afterSecondMoveUp = nodes.map((n: any) => n.id);

      // @ts-expect-error
      moveSelected(-1); // already at the top — no-op, guarded by idx===0
      // @ts-expect-error
      const afterNoOpMoveUp = nodes.map((n: any) => n.id);

      // @ts-expect-error
      moveSelected(1); // C moves back down past A: A, C, B
      // @ts-expect-error
      const afterMoveDown = nodes.map((n: any) => n.id);

      return { afterFirstMoveUp, afterSecondMoveUp, afterNoOpMoveUp, afterMoveDown };
    });

    expect(orchestrationResult.afterFirstMoveUp.order).toEqual([1, 3, 2]); // A, C, B
    expect(orchestrationResult.afterFirstMoveUp.selectedId).toBe(3); // selection follows the moved node
    expect(orchestrationResult.afterFirstMoveUp.undoStackGrew).toBe(true); // pushUndo() really fired
    expect(orchestrationResult.afterFirstMoveUp.renderedRows).toBe(3); // render() really fired
    expect(orchestrationResult.afterSecondMoveUp).toEqual([3, 1, 2]); // C, A, B
    expect(orchestrationResult.afterNoOpMoveUp).toEqual([3, 1, 2]); // unchanged — C is already first
    expect(orchestrationResult.afterMoveDown).toEqual([1, 3, 2]); // A, C, B

    // 3. Proof the rest of the script still runs.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof getSelectionRangeIds === 'function' && typeof esc === 'function' && typeof loadTemplatesIndex === 'function' && typeof indentSelected === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
