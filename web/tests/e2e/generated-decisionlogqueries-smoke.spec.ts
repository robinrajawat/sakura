import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Second and third slices of the Decision Log domain — the pure lookup/anchor-label/status-query
// layer, plus (third slice) getDecisionAnchorCandidates. Exercises the real, unchanged
// findDecisionLog/decisionLogForNode/decisionStatusLabel/decisionStatusOf/decisionLogAnchorLabel/
// getDecisionAnchorCandidates wrapper functions — not the extracted *Core functions directly —
// against real global state, to prove the real call sites still resolve correctly after the
// splice.
test.describe('generated decisionLogQueries block (src/state/decisionLogQueries.ts spliced into index.html)', () => {
  test('decision log lookup/anchor/status wrapper functions all work through real decisionLogs and nodes', async ({ page }) => {
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
        { id: 1, text: '[Project Plan] overview', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Budget review', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      decisionLogs = [
        { id: 'dl1', anchorNodeId: 1, status: 'approved' },
        { id: 'dl2', anchorNodeId: null, status: 'unknown-status' }
      ];

      return {
        // @ts-expect-error
        found: findDecisionLog('dl1'),
        // @ts-expect-error
        forNode: decisionLogForNode(1),
        // @ts-expect-error
        forNodeExcluded: decisionLogForNode(1, 'dl1'),
        // @ts-expect-error
        statusLabelApproved: decisionStatusLabel('approved'),
        // @ts-expect-error
        statusLabelDefault: decisionStatusLabel(''),
        // @ts-expect-error
        statusOfKnown: decisionStatusOf({ status: 'APPROVED' }),
        // @ts-expect-error
        statusOfUnknown: decisionStatusOf({ status: 'unknown-status' }),
        // @ts-expect-error
        anchorLinked: decisionLogAnchorLabel({ anchorNodeId: 1 }),
        // @ts-expect-error
        anchorUnlinked: decisionLogAnchorLabel({ anchorNodeId: null }),
        // @ts-expect-error
        candidatesAll: getDecisionAnchorCandidates(''),
        // @ts-expect-error
        candidatesFiltered: getDecisionAnchorCandidates('budget'),
        // @ts-expect-error
        candidatesExcluded: getDecisionAnchorCandidates('', 'dl1')
      };
    });

    expect(result.found).toEqual({ id: 'dl1', anchorNodeId: 1, status: 'approved' });
    expect(result.forNode).toEqual({ id: 'dl1', anchorNodeId: 1, status: 'approved' });
    expect(result.forNodeExcluded).toBeNull();
    expect(result.statusLabelApproved).toBe('Approved');
    expect(result.statusLabelDefault).toBe('Proposed');
    expect(result.statusOfKnown).toBe('approved');
    expect(result.statusOfUnknown).toBe('proposed');
    expect(result.anchorLinked).toBe('Under: Project Plan overview');
    expect(result.anchorUnlinked).toBe('Not linked to a node');
    // node 1 has a real decision log (dl1) anchored to it -> taken; node 2 doesn't.
    expect(result.candidatesAll).toEqual([
      { id: 1, text: 'Project Plan overview', taken: true, depth: 0 },
      { id: 2, text: 'Budget review', taken: false, depth: 1 }
    ]);
    expect(result.candidatesFiltered).toEqual([
      { id: 2, text: 'Budget review', taken: false, depth: 1 }
    ]);
    // excluding dl1 itself means node 1 is no longer shown as taken.
    expect(result.candidatesExcluded[0]).toEqual({ id: 1, text: 'Project Plan overview', taken: false, depth: 0 });

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
