import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Sixth slice of the diagramGen* subsystem — the pure final-rect/bounds computation. Unlike
// every prior slice, this was never a standalone named function in index.html (an inline
// fragment inside diagramGenFinishGenerate) — there is no original wrapper name to preserve, so
// this test calls the real, generated computeDiagramGenFinalRectsCore directly by name, a
// genuine top-level global now. Also exercises diagramGenFinishGenerate itself end-to-end
// against a real outline/nodeMeta to prove the glue statement inside it (destructuring this
// function's result into finalRect/minX/maxX/maxY/offsetX) still resolves correctly.
test.describe('generated diagramGenRects block (src/state/diagramGenRects.ts spliced into index.html)', () => {
  test('computeDiagramGenFinalRectsCore works directly, and diagramGenFinishGenerate still produces real XML using it', async ({ page }) => {
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

    const directResult = await page.evaluate(() => {
      const positions = new Map([[0, { x: 100, y: 0 }]]);
      const dimsByIdx = new Map([[0, { w: 60, h: 44 }]]);
      // @ts-expect-error — bare global from index.html, no wrapper name (see this file's header)
      const result = computeDiagramGenFinalRectsCore([0], positions, dimsByIdx);
      return {
        x: result.finalRect.get(0).x,
        minX: result.minX,
        maxX: result.maxX,
        maxY: result.maxY
      };
    });
    expect(directResult.x).toBe(40); // shifted to the fixed 40px left margin
    expect(directResult.minX).toBe(100);
    expect(directResult.maxX).toBe(160); // 100+60
    expect(directResult.maxY).toBe(44);

    // End-to-end: a real diagramGenFinishGenerate call (via the Generate flow's own confirm
    // path) still produces well-formed XML using this function's output for every node's
    // position, proving the glue statement inside it resolves correctly through the real
    // orchestration, not just in isolation. diagramGenFinishGenerate has no return value of its
    // own — it pushes a new entry onto the real `diagrams` array (via addDiagramFromXml) as a
    // side effect, so that's what gets inspected here.
    const e2eResult = await page.evaluate(() => {
      // @ts-expect-error
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      diagrams = [];
      const scope = { rootIdxs: [0], baseDepth: 0, scopeIdxs: [0, 1, 2], genKey: 'wholedoc' };
      const labels = new Map([[0, 'Root'], [1, 'A'], [2, 'B']]);
      // @ts-expect-error
      const proposedMeta = diagramGenProposeNodeMeta(scope, null);
      // @ts-expect-error
      diagramGenFinishGenerate(scope, labels, proposedMeta, null);
      // @ts-expect-error
      const created = diagrams[diagrams.length - 1];
      return {
        diagramCreated: !!created,
        hasMxGraphModel: !!created && typeof created.xml === 'string' && created.xml.includes('mxGraphModel')
      };
    });
    expect(e2eResult.diagramCreated).toBe(true);
    expect(e2eResult.hasMxGraphModel).toBe(true);

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
