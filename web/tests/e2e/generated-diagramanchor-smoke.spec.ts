import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// A Phase 2 revisit (not core/, since the diagrams array is separate from the outline `nodes`
// array, though anchor-label/orphan logic reads `nodes` read-only). Exercises the real,
// unchanged diagramAnchorLabel()/diagramIsOrphaned() wrapper functions against real global
// state, not the extracted functions directly.
test.describe('generated diagramAnchor block (src/state/diagramAnchor.ts spliced into index.html)', () => {
  test('anchor label and orphan detection work through the real wrapper functions', async ({ page }) => {
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

    // Real anchor-label / orphan checks against a real `nodes` array and real
    // diagram objects, through the real (unchanged) wrapper functions.
    const anchorResult = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [{ id: 1, text: '[Project Plan] overview', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }];

      const linked = { id: 'd1', anchorNodeId: 1 };
      const unlinked = { id: 'd2', anchorNodeId: null };
      const orphaned = { id: 'd3', anchorNodeId: 999 };

      return {
        // @ts-expect-error
        linkedLabel: diagramAnchorLabel(linked),
        // @ts-expect-error
        unlinkedLabel: diagramAnchorLabel(unlinked),
        // @ts-expect-error
        orphanedLabel: diagramAnchorLabel(orphaned),
        // @ts-expect-error
        linkedIsOrphaned: diagramIsOrphaned(linked),
        // @ts-expect-error
        orphanedIsOrphaned: diagramIsOrphaned(orphaned)
      };
    });

    expect(anchorResult.linkedLabel).toBe('Under: Project Plan overview');
    expect(anchorResult.unlinkedLabel).toBe('Not linked to a node');
    expect(anchorResult.orphanedLabel).toBe('Linked node no longer exists');
    expect(anchorResult.linkedIsOrphaned).toBe(false);
    expect(anchorResult.orphanedIsOrphaned).toBe(true);

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
