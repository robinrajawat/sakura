import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Third slice of the diagramGen* subsystem — the nodeMeta classification-proposal and
// plain-object (de)serialization layer. Exercises the real, unchanged
// diagramGenProposeNodeMeta/diagramGenNodeMetaFromPlain/diagramGenNodeMetaToPlain wrapper
// functions — not the extracted *Core functions directly — against a real `nodes` array, to
// prove the real call sites still resolve correctly after the splice.
test.describe('generated diagramGenNodeMeta block (src/state/diagramGenNodeMeta.ts spliced into index.html)', () => {
  test('diagramGenProposeNodeMeta/NodeMetaFromPlain/NodeMetaToPlain all work through the real wrapper functions', async ({ page }) => {
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
      // Tree: root(0, tags:['database']) -> leaf(1), leaf(2) — a chain group under root, plus
      // root itself gets a shape guess from its 'database' tag.
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: ['database'], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Leaf A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'Leaf B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];

      // @ts-expect-error
      const proposed = diagramGenProposeNodeMeta({ scopeIdxs: [0, 1, 2] }, undefined);
      const rootMeta = proposed.get(1);

      // Round-trip through the real ToPlain/FromPlain wrappers.
      // @ts-expect-error
      const plain = diagramGenNodeMetaToPlain(proposed);
      // @ts-expect-error
      const roundTripped = diagramGenNodeMetaFromPlain(plain);

      return {
        rootShape: rootMeta?.shape,
        plainHas1: Object.prototype.hasOwnProperty.call(plain, '1'),
        roundTrippedRootShape: roundTripped.get(1)?.shape
      };
    });

    expect(result.rootShape).toBe('datastore'); // 'database' tag maps to 'datastore'
    expect(result.plainHas1).toBe(true);
    expect(result.roundTrippedRootShape).toBe('datastore');

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
