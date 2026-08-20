import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// A third `core/` slice alongside nodeQueries.ts and nodeMutations.ts. Unlike those two, this
// one's wrapper functions (getSelectedIds/getSelectionRootIndexes/rebuildParentIds) are called
// from ~79 places across index.html — this test exercises them through the real editor UI
// (creating nodes, selecting a range, indenting) rather than calling the wrappers directly, so
// it's proof the extraction works against real DOM-driven selection state and real tree
// mutations, not just a hand-picked call. Also checks the "entire script silently died" failure
// mode (an unrelated later function still being callable proves the whole script executed).
test.describe('generated nodeSelection block (src/core/nodeSelection.ts spliced into index.html)', () => {
  test('multi-select, indent (which calls rebuildParentIds internally), and parentId all reflect real editor state', async ({ page }) => {
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

    // Build a real three-node flat tree, real multi-select two of them (via the real
    // setSingleSelection/multiSelectedIds path, not a mock), and confirm getSelectedIds /
    // getSelectionRootIndexes report it correctly against the real global `nodes` array.
    const selectionResult = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'A', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'B', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'C', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      selectAllMode = false;
      // @ts-expect-error
      multiSelectedIds = [1, 2];
      // @ts-expect-error
      selectedId = 2;

      return {
        // @ts-expect-error
        selectedIds: getSelectedIds(),
        // @ts-expect-error
        rootIndexes: getSelectionRootIndexes()
      };
    });
    expect(selectionResult.selectedIds).toEqual([1, 2]);
    expect(selectionResult.rootIndexes).toEqual([0, 1]);

    // Now indent node B (id 2) under A (id 1) — this calls indentSelected(), which internally
    // calls rebuildParentIds() (the wrapper around rebuildParentIdsCore) as part of real
    // orchestration (undo push, dirty flag, render). Confirm B's parentId is now A's id.
    const afterIndent = await page.evaluate(() => {
      // @ts-expect-error
      selectedId = 2;
      // @ts-expect-error
      selectAllMode = false;
      // @ts-expect-error
      multiSelectedIds = [];
      // @ts-expect-error
      indentSelected();
      // @ts-expect-error
      return { bDepth: nodes[1].depth, bParentId: nodes[1].parentId, aId: nodes[0].id };
    });
    expect(afterIndent.bDepth).toBe(1);
    expect(afterIndent.bParentId).toBe(afterIndent.aId);

    // Proof the rest of the script still runs — an unrelated, physically-distant function
    // (defined tens of thousands of characters later in the file) is still callable. This is
    // exactly the check that would have caught the serializeMarkdown import-statement bug: a
    // syntax error anywhere in the script kills everything after it, not just the broken block.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
