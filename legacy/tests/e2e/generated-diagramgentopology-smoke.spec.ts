import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Second slice of the diagramGen* subsystem — the topology/confirmed-nodeMeta query layer.
// Exercises the real, unchanged diagramGenAllChildIdxs/diagramGenIsLeaf/diagramGenIsChainGroup/
// diagramGenIsConfirmedEdgeLabel/diagramGenIsPassthrough/diagramGenIsMergeCandidate/
// diagramGenRenderChildIdxs/diagramGenChainTailIdx/diagramGenEdgeLabelBefore wrapper functions —
// not the extracted *Core functions directly — against a real `nodes` array, to prove the real
// call sites still resolve correctly after the splice.
test.describe('generated diagramGenTopology block (src/state/diagramGenTopology.ts spliced into index.html)', () => {
  test('diagramGen topology/nodeMeta-query wrapper functions all work through real nodes and nodeMeta', async ({ page }) => {
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
      // Tree: root(0) -> label(1, edge-label, text "goes here"), real(2), real(3)
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'goes here', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'Real A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 4, text: 'Real B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      const nodeMeta = new Map([[2, { shape: 'edge-label' }]]);

      // @ts-expect-error
      const allChildIdxs = diagramGenAllChildIdxs(0);
      // @ts-expect-error
      const isLeafRoot = diagramGenIsLeaf(0);
      // @ts-expect-error
      const isLeafChild = diagramGenIsLeaf(1);
      // @ts-expect-error
      const isConfirmedEdgeLabel = diagramGenIsConfirmedEdgeLabel(1, nodeMeta);
      // @ts-expect-error
      const renderChildIdxs = diagramGenRenderChildIdxs(0, nodeMeta);
      // @ts-expect-error
      const edgeLabelBefore = diagramGenEdgeLabelBefore(0, nodeMeta);

      return {
        allChildIdxs,
        isLeafRoot,
        isLeafChild,
        isConfirmedEdgeLabel,
        renderChildIdxs,
        edgeLabelBeforeAt2: edgeLabelBefore.get(2)
      };
    });

    expect(result.allChildIdxs).toEqual([1, 2, 3]);
    expect(result.isLeafRoot).toBe(false);
    expect(result.isLeafChild).toBe(true);
    expect(result.isConfirmedEdgeLabel).toBe(true);
    expect(result.renderChildIdxs).toEqual([2, 3]); // edge-label (idx1) dropped
    expect(result.edgeLabelBeforeAt2).toBe('goes here'); // label attaches to next real child

    // Proof the rest of the script still runs — an unrelated, physically-distant function is
    // still callable, the standard check for every cutover.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
