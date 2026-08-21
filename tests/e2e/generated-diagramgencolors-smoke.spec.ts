import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Fourth slice of the diagramGen* subsystem — the pure branch/tag/marker color-assignment
// layer, plus its small companion shape-color-override function. Exercises the real, unchanged
// diagramGenTagColorKey/assignDiagramGenColors/applyDiagramGenShapeColorOverrides wrapper
// functions — not the extracted *Core functions directly — against a real `nodes` array, to
// prove the real call sites still resolve correctly after the splice.
test.describe('generated diagramGenColors block (src/state/diagramGenColors.ts spliced into index.html)', () => {
  test('diagramGenTagColorKey/assignDiagramGenColors work through the real wrapper functions', async ({ page }) => {
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
      // Tree: root(0) -> a(1, marker:'issue'), b(2, tags:['billing']) — a genuine fan-out at
      // root, with a's explicit marker outranking anything else and b picking up a tag color.
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: 'issue', slideDivider: false },
        { id: 3, text: 'B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: ['billing'], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];

      // @ts-expect-error
      const tagKey = diagramGenTagColorKey('billing');
      // @ts-expect-error
      const tagKeyDeterministic = diagramGenTagColorKey('billing');

      // @ts-expect-error
      const colorMap = assignDiagramGenColors({ rootIdxs: [0] }, undefined);

      return {
        tagKey,
        tagKeyDeterministic,
        rootColor: colorMap.get(0),
        aColor: colorMap.get(1), // marker 'issue' -> red
        bColor: colorMap.get(2) // tag 'billing' -> its hashed hue
      };
    });

    expect(result.tagKey).toBe(result.tagKeyDeterministic); // deterministic hash
    expect(result.rootColor).toBe('gray');
    expect(result.aColor).toBe('red'); // DIAGRAM_GEN_MARKER_COLOR.issue
    expect(result.bColor).toBe(result.tagKey);

    // Proof the rest of the script still runs — an unrelated, physically-distant function is
    // still callable, the standard check for every cutover.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof esc === 'function' && typeof getAllAiProviders === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });

  test('applyDiagramGenShapeColorOverrides works through the real wrapper function', async ({ page }) => {
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
      // Tree: root(0), a(1, classified 'ui'), b(2, unclassified) — a real shape exists in
      // scope (a), so b's leftover branch hue falls back to gray.
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];

      const colorByIdx = new Map([[1, 'purple'], [2, 'teal']]);
      const nodeMeta = new Map([[2, { shape: 'ui' }]]); // node id 2 = 'A'

      // @ts-expect-error
      applyDiagramGenShapeColorOverrides({ scopeIdxs: [0, 1, 2] }, colorByIdx, nodeMeta, true);

      return {
        aColor: colorByIdx.get(1), // classified 'ui' -> its palette color
        bColor: colorByIdx.get(2) // unclassified, real shape exists elsewhere -> gray
      };
    });

    expect(result.aColor).toBe('blue'); // DIAGRAM_GEN_SHAPE_COLOR.ui
    expect(result.bColor).toBe('gray');

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
