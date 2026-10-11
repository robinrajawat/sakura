import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Export domain — third slice. Exercises the real getClipboardExportColors/
// parseStyledTextForClipboard/serializeClipboardHtml wrapper functions — the same call path the
// Ctrl/Cmd+C node copy (copyNodesToClipboard) uses — against real nodes/treeIndentWidth/
// outlineNumbering globals (hideTreeLines is now a fixed `true` constant, no more Settings
// toggle). softenCore/depthTextColorCore are checked directly: their hand-written wrappers went
// away with the image export, their only other caller.
test.describe('generated serializeClipboardHtml block (src/utils/serializeClipboardHtml.ts spliced into index.html)', () => {
  test('clipboard HTML wrapper functions all work through real nodes/prefs, and the spliced color helpers resolve', async ({ page }) => {
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
        { id: 1, text: '[Section] Root', depth: 0, parentId: null, styles: { bold: true }, note: '', noteTitle: '', codeBlock: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Child', depth: 1, parentId: 1, styles: {}, note: '', noteTitle: '', codeBlock: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      treeIndentWidth = 3;
      // @ts-expect-error
      outlineNumbering = false;

      // @ts-expect-error
      const colors = getClipboardExportColors();
      // @ts-expect-error
      const mixed = softenCore('#ff0000', '#0000ff', 0.5);
      // @ts-expect-error
      const depthColor = depthTextColorCore(1, colors.fg, colors.muted);
      // @ts-expect-error
      const parsed = parseStyledTextForClipboard('run **npm test** now', colors);
      // @ts-expect-error
      const html = serializeClipboardHtml(nodes, false);

      return { colors, mixed, depthColor, parsed, html };
    });

    expect(result.colors.fg).toBe('#1a1a1a');
    expect(result.mixed).toBe('rgb(128, 0, 128)');
    expect(typeof result.depthColor).toBe('string');
    expect(result.parsed).toBe('run <b>npm test</b> now');
    expect(result.html).toContain('<!doctype html>');
    expect(result.html).toContain('Root');
    expect(result.html).toContain('Child');
    expect(result.html).toContain('font-weight:700');

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
