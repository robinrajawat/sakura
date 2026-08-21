import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Export domain — third slice. Exercises the real, unchanged getClipboardExportColors/
// depthTextColor/soften/parseStyledTextForClipboard/serializeClipboardHtml wrapper functions —
// the same call path exportToClipboard uses — against real nodes/treeIndentWidth/hideTreeLines/
// outlineNumbering globals, not the extracted *Core functions directly. Also confirms soften's
// other real, unchanged hand-written call site (image export's getImageExportColors chain)
// still resolves correctly after the splice.
test.describe('generated serializeClipboardHtml block (src/utils/serializeClipboardHtml.ts spliced into index.html)', () => {
  test('clipboard HTML wrapper functions all work through real nodes/prefs, and soften still resolves for its other hand-written callers', async ({ page }) => {
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
        { id: 1, text: '[Section] Root', depth: 0, parentId: null, styles: { bold: true }, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Child', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      treeIndentWidth = 3;
      // @ts-expect-error
      hideTreeLines = false;
      // @ts-expect-error
      outlineNumbering = false;

      // @ts-expect-error
      const colors = getClipboardExportColors();
      // @ts-expect-error
      const mixed = soften('#ff0000', '#0000ff', 0.5);
      // @ts-expect-error
      const depthColor = depthTextColor(1, colors.fg, colors.muted);
      // @ts-expect-error
      const parsed = parseStyledTextForClipboard('run `npm test` now', colors);
      // @ts-expect-error
      const html = serializeClipboardHtml(nodes, false);

      // Prove soften still resolves correctly for its OTHER real hand-written call site
      // (image export's color pipeline) — not just serializeClipboardHtml's own internal use.
      // @ts-expect-error
      const imageColors = getImageExportColors();

      return { colors, mixed, depthColor, parsed, html, imageColorsOk: !!imageColors && typeof imageColors === 'object' };
    });

    expect(result.colors.fg).toBe('#1a1a1a');
    expect(result.mixed).toBe('rgb(128, 0, 128)');
    expect(typeof result.depthColor).toBe('string');
    expect(result.parsed).toContain('Consolas');
    expect(result.html).toContain('<!doctype html>');
    expect(result.html).toContain('Root');
    expect(result.html).toContain('Child');
    expect(result.html).toContain('font-weight:700');
    expect(result.imageColorsOk).toBe(true);

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
