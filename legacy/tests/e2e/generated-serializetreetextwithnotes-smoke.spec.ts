import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Export domain — fourth slice. Exercises the real, unchanged serializeTreeTextWithNotes()
// wrapper — the same call path generateQaQuestionsAI uses — against real nodes/treeIndentWidth/
// hideTreeLines/outlineNumbering globals AND the real, unchanged, genuinely DOM-touching
// stripHtmlToText (not a fake), proving the injected-dependency wiring resolves correctly
// through the real call path, not just in isolation.
test.describe('generated serializeTreeTextWithNotes block (src/utils/serializeTreeTextWithNotes.ts spliced into index.html)', () => {
  test('serializeTreeTextWithNotes renders real ASCII tree + Note: lines via the real injected stripHtmlToText', async ({ page }) => {
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
        { id: 1, text: '[Section] Root', depth: 0, parentId: null, styles: {}, note: '<p>Root note with <b>markup</b></p>', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Child', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      treeIndentWidth = 3;
      // @ts-expect-error
      hideTreeLines = false;
      // @ts-expect-error
      outlineNumbering = false;

      // @ts-expect-error
      const outline = serializeTreeTextWithNotes(nodes, false);

      // Comparison: the plain serializeTreeText (a real sibling wrapper, unaffected by this
      // slice) should NOT include note content, proving the two stay independently correct.
      // @ts-expect-error
      const plainOutline = serializeTreeText(nodes, false);

      return { outline, plainOutline };
    });

    const lines = result.outline.split('\n');
    expect(lines[0]).toBe('Section Root');
    // The real stripHtmlToText strips the <b> markup and collapses whitespace — proving the
    // REAL DOM-touching function ran, not a stand-in.
    expect(lines[1]).toContain('Note: Root note with markup');
    expect(lines[2]).toContain('Child');
    expect(result.outline).not.toContain('<b>');
    expect(result.outline).not.toContain('<p>');

    expect(result.plainOutline).not.toContain('Note:');

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
