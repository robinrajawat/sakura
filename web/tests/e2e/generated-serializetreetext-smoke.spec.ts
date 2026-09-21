import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Export domain — first slice. Exercises the real, unchanged serializeTreeText() wrapper — the
// same call path exportTreeFormat/exportToClipboard use — against real nodes/treeIndentWidth/
// hideTreeLines/outlineNumbering globals, not the extracted serializeTreeTextCore directly.
test.describe('generated serializeTreeText block (src/utils/serializeTreeText.ts spliced into index.html)', () => {
  test('serializeTreeText renders a real ASCII tree, honoring rebaseDepth/outlineNumbering/hideTreeLines/treeIndentWidth', async ({ page }) => {
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
        { id: 1, text: '[Section] Root', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Child A', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'Child B', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      treeIndentWidth = 3;
      // @ts-expect-error
      hideTreeLines = false;
      // @ts-expect-error
      outlineNumbering = false;

      // @ts-expect-error
      const plain = serializeTreeText(nodes, false);

      // @ts-expect-error
      outlineNumbering = true;
      // @ts-expect-error
      const numbered = serializeTreeText(nodes, false);
      // @ts-expect-error
      outlineNumbering = false;

      // @ts-expect-error
      hideTreeLines = true;
      // @ts-expect-error
      const linesHidden = serializeTreeText(nodes, false);
      // @ts-expect-error
      hideTreeLines = false;

      // A subtree, rebased so its shallowest node renders at depth 0.
      // @ts-expect-error
      const subtree = nodes.slice(1);
      // @ts-expect-error
      const rebased = serializeTreeText(subtree, true);

      return { plain, numbered, linesHidden, rebased };
    });

    expect(result.plain.split('\n')[0]).toBe('Section Root');
    expect(result.plain).toContain('Child A');
    expect(result.plain).toContain('Child B');
    expect(result.plain).toContain('│'.repeat(0) + '├');

    expect(result.numbered).toContain('1 Section Root');
    expect(result.numbered).toContain('1.1 Child A');

    expect(result.linesHidden).not.toContain('│');

    expect(result.rebased.split('\n')[0]).toBe('Child A');
    expect(result.rebased.split('\n')[1]).toBe('Child B');

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
