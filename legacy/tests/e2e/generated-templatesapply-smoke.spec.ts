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

  // Follow-up: applyBuiltinDefaultTemplate() was rewritten to reuse this same generated core
  // (see index.html's DEFAULT_TEMPLATE_RAW_NODES + docs/architecture-plan.md for why its
  // original explicit `.id`-based parenting was dead code, unconditionally overwritten by its
  // own trailing rebuildParentIds() call). This test pins the exact real tree shape — text,
  // depth, and derived parentId chains — against the real wrapper, proving the flat-data
  // rewrite reproduces the original hardcoded tree exactly, not just "some" 16-node tree.
  test('applyBuiltinDefaultTemplate reproduces the exact original 16-node tree shape via the real wrapper function', async ({ page }) => {
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

    const result = await page.evaluate(() => {
      // Dirty ambient state beforehand (including a stale nextId) to prove the wrapper's own
      // `nextId=1` reset and selection reset both really run, not coincidentally already right.
      // @ts-expect-error — bare globals from index.html
      nextId = 999;
      // @ts-expect-error
      selectedId = 12345;
      // @ts-expect-error
      selectAllMode = true;
      // @ts-expect-error
      multiSelectedIds = [12345];

      // @ts-expect-error
      applyBuiltinDefaultTemplate();

      // @ts-expect-error
      return {
        // @ts-expect-error
        count: nodes.length,
        // @ts-expect-error
        rows: nodes.map((n) => ({ id: n.id, text: n.text, depth: n.depth, parentId: n.parentId })),
        // @ts-expect-error
        rootBold: !!nodes[0].styles?.bold,
        // @ts-expect-error
        rootId: nodes[0].id,
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

    expect(result.count).toBe(16);
    // Fresh ids minted 1..16 off the real nextId=1 reset (not the dirtied 999 the test seeded).
    expect(result.rootId).toBe(1);
    expect(result.nextIdAfter).toBe(17);
    expect(result.rootBold).toBe(true);

    // Exact original tree shape — text, depth, and the parentId chain rebuildParentIds derived
    // from depth. Deliberately checks structure (which node is whose parent) rather than raw
    // ids, since ids are an implementation detail; the shape is what must never silently drift.
    const byText = new Map(result.rows.map((r: { id: number; text: string; depth: number; parentId: number | null }) => [r.text, r]));
    const idOf = (text: string) => byText.get(text)!;
    expect(idOf('Application Architecture').depth).toBe(0);
    expect(idOf('Application Architecture').parentId).toBeNull();
    expect(idOf('UI Layer').depth).toBe(1);
    expect(idOf('Fiori Elements App').depth).toBe(2);
    // Every depth-1 section (UI/Service/Projection/Business Object/Persistence Layer) is a
    // direct child of the root — the same "flat siblings under one root" shape the original's
    // repeated `root.id` parenting produced.
    for (const section of ['UI Layer', 'Service Layer', 'Projection / Consumption Layer', 'Business Object / CDS Layer', 'Persistence Layer']) {
      expect(idOf(section).parentId).toBe(result.rootId);
    }
    // The deepest chain (Business Object -> Root View Entity -> Behaviour -> Definition ->
    // Implementation) nests correctly through real depth-derived parenting, five levels deep.
    expect(idOf('Root View Entity (Interface View, I_*)').parentId).toBe(idOf('Business Object / CDS Layer').id);
    expect(idOf('Behaviour').parentId).toBe(idOf('Root View Entity (Interface View, I_*)').id);
    expect(idOf('Definition (.bdef)').parentId).toBe(idOf('Behaviour').id);
    expect(idOf('Implementation (.bimpl)').parentId).toBe(idOf('Definition (.bdef)').id);

    expect(result.selectedIdAfter).toBe(result.rootId);
    expect(result.selectAllModeAfter).toBe(false);
    expect(result.multiSelectedIdsAfter).toEqual([]);

    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
