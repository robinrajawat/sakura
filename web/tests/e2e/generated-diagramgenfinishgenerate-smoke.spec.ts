import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Sixth slice of the diagramGen* subsystem — the XML-cell-string-assembly pass
// diagramGenRects.ts's own header flagged as a separate future scoping question. Exercises the
// real, unchanged diagramGenFinishGenerate() wrapper end-to-end — the same call path both the
// review-screen confirm flow and one-click generate use — against real nodes/diagrams global
// state, for BOTH the "new diagram" and "regenerate existing diagram" branches (the two real
// orchestration paths left in the hand-written wrapper after this slice's XML-assembly core was
// factored out).
test.describe('generated diagramGenFinishGenerate block (src/state/diagramGenFinishGenerate.ts spliced into index.html)', () => {
  test('diagramGenFinishGenerate produces real XML for both the new-diagram and regenerate-existing-diagram orchestration paths', async ({ page }) => {
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
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: '[Section] Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: ['important'], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Branch A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: 'confirmed', slideDivider: false },
        { id: 3, text: 'Branch B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      diagrams = [];

      const scope = { rootIdxs: [0], baseDepth: 0, scopeIdxs: [0, 1, 2], genKey: 'wholedoc' };
      const labels = new Map([[0, 'Root'], [1, 'Branch A'], [2, 'Branch B']]);
      // @ts-expect-error
      const proposedMeta = diagramGenProposeNodeMeta(scope, null);

      // Path 1: new diagram (existing = null) — addDiagramFromXml orchestration.
      // @ts-expect-error
      diagramGenFinishGenerate(scope, labels, proposedMeta, null);
      // @ts-expect-error
      const created = diagrams[diagrams.length - 1];

      // Path 2: regenerate an existing diagram — the existing.xml/pageCount/modifiedAt/
      // nodeMeta mutation + markDirty/scheduleAutoSave/renderDiagramsList orchestration branch,
      // never exercised by diagramGenRects.ts's own smoke test.
      const labels2 = new Map([[0, 'Root'], [1, 'Branch A'], [2, 'Branch B']]);
      const beforeModifiedAt = created.modifiedAt;
      // @ts-expect-error
      diagramGenFinishGenerate(scope, labels2, proposedMeta, created);

      return {
        diagramCreated: !!created,
        hasMxGraphModel: !!created && typeof created.xml === 'string' && created.xml.includes('mxGraphModel'),
        hasAnchorNodeId: created && created.anchorNodeId === 1,
        // @ts-expect-error
        diagramsLengthAfterRegenerate: diagrams.length,
        regeneratedXmlStillWellFormed: typeof created.xml === 'string' && created.xml.includes('</mxfile>'),
        modifiedAtUpdated: typeof created.modifiedAt === 'number' && created.modifiedAt >= beforeModifiedAt,
        legendPresent: created.xml.includes('gd-legend'),
      };
    });

    expect(result.diagramCreated).toBe(true);
    expect(result.hasMxGraphModel).toBe(true);
    // Whole-document single-root scope anchors to that root node (real anchoring orchestration
    // in the hand-written wrapper, unaffected by this slice).
    expect(result.hasAnchorNodeId).toBe(true);
    // Regenerating an existing diagram mutates in place — diagrams array doesn't grow.
    expect(result.diagramsLengthAfterRegenerate).toBe(1);
    expect(result.regeneratedXmlStillWellFormed).toBe(true);
    expect(result.modifiedAtUpdated).toBe(true);
    // A marker (Branch A's "confirmed") produces a real legend entry end to end.
    expect(result.legendPresent).toBe(true);

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
