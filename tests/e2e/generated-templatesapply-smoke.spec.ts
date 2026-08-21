import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Exercises applyTemplateNodesCore (src/core/templatesApply.ts) through the real, unchanged
// applyTemplateNodes() wrapper — called directly rather than through loadTemplateById(), which
// also touches an unrelated DOM element (#templates-menu) not present/wired in this headless
// harness and orthogonal to what this slice extracted. This still proves the injected
// makeNode/emptyStyles deps wire through to the real ambient makeNode (real id minting off the
// real nextId counter, real timestamps) and that the hand-written parts left in the wrapper
// (rebuildParentIds, selection reset) still run correctly against the generated core's output.
test.describe('generated templatesApply block (src/core/templatesApply.ts spliced into index.html)', () => {
  test('applyTemplateNodes constructs real nodes with fresh ids via the real makeNode, rebuilds parentIds, and resets selection', async ({ page }) => {
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

    const result = await page.evaluate(async () => {
      // Seed the ambient nextId high enough to prove fresh ids are actually minted by the
      // real makeNode (not hardcoded/stale from the raw template data below).
      // @ts-expect-error — bare globals from index.html
      nextId = 500;
      const rawNodes = [
        { text: 'Root', depth: 0, isCheckbox: false, checked: false, tags: ['x'] },
        { text: 'Child', depth: 1, isCheckbox: true, checked: true },
      ];

      // Dirty the selection state beforehand so we can prove it's really reset, not
      // coincidentally already in the expected state.
      // @ts-expect-error
      selectedId = 999;
      // @ts-expect-error
      selectAllMode = true;
      // @ts-expect-error
      multiSelectedIds = [999];

      // @ts-expect-error
      applyTemplateNodes(rawNodes);

      // @ts-expect-error
      return {
        // @ts-expect-error
        nodeCount: nodes.length,
        // @ts-expect-error
        texts: nodes.map((n) => n.text),
        // @ts-expect-error
        ids: nodes.map((n) => n.id),
        // @ts-expect-error
        childParentId: nodes[1].parentId,
        // @ts-expect-error
        rootParentId: nodes[0].parentId,
        // @ts-expect-error
        childChecked: nodes[1].checked,
        // @ts-expect-error
        rootTags: nodes[0].tags,
        // @ts-expect-error
        nextIdAfter: nextId,
        // @ts-expect-error
        selectedIdAfter: selectedId,
        // @ts-expect-error
        selectAllModeAfter: selectAllMode,
        // @ts-expect-error
        multiSelectedIdsAfter: multiSelectedIds,
      };
    });

    expect(result.nodeCount).toBe(2);
    expect(result.texts).toEqual(['Root', 'Child']);
    // Fresh ids minted by the real makeNode off the seeded nextId=500 counter, not stale/
    // hardcoded values from the raw template data (which had none).
    expect(result.ids).toEqual([500, 501]);
    expect(result.nextIdAfter).toBe(502);
    // rebuildParentIds() (hand-written, called by the wrapper after the generated core runs)
    // correctly derived the Child's parentId from depth against the real node array.
    expect(result.rootParentId).toBeNull();
    expect(result.childParentId).toBe(500);
    expect(result.childChecked).toBe(true);
    expect(result.rootTags).toEqual(['x']);
    // Selection reset (hand-written) ran against the real freshly-constructed nodes.
    expect(result.selectedIdAfter).toBe(500);
    expect(result.selectAllModeAfter).toBe(false);
    expect(result.multiSelectedIdsAfter).toEqual([]);

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
