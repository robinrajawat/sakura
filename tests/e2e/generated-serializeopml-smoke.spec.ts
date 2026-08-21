import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Export domain — second slice. Exercises the real, unchanged nodesToOutlineXml/serializeOpml
// wrapper functions — the same call path exportOpml uses — against real nodes/
// nodeContentExportEnabled globals and the real getMeta() DOM read, not the extracted
// *Core functions directly.
test.describe('generated serializeOpml block (src/utils/serializeOpml.ts spliced into index.html)', () => {
  test('serializeOpml renders a real OPML document via the real wrapper, honoring getMeta() and nodeContentExportEnabled', async ({ page }) => {
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

    // getMeta() reads #header-title's real DOM value — set it directly so serializeOpml's
    // title comes from the real DOM read, not an injected stand-in.
    const result = await page.evaluate(() => {
      const titleInput = document.getElementById('header-title') as HTMLInputElement | null;
      if (titleInput) titleInput.value = 'My Real Document';

      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: '[Section] Todos', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Buy milk', depth: 1, parentId: 1, styles: {}, note: 'urgent', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: true, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      nodeContentExportEnabled = true;

      // @ts-expect-error
      const withNotes = serializeOpml(nodes);

      // @ts-expect-error
      nodeContentExportEnabled = false;
      // @ts-expect-error
      const withoutNotes = serializeOpml(nodes);
      // @ts-expect-error
      nodeContentExportEnabled = true;

      // @ts-expect-error
      const empty = serializeOpml([]);

      return { withNotes, withoutNotes, empty };
    });

    expect(result.withNotes).toContain('<title>My Real Document</title>');
    expect(result.withNotes).toContain('<outline text="Section Todos">');
    expect(result.withNotes).toContain('<outline text="[ ] Buy milk" _note="urgent"/>');

    expect(result.withoutNotes).toContain('<outline text="[ ] Buy milk"/>');
    expect(result.withoutNotes).not.toContain('_note');

    expect(result.empty).toContain('<title>My Real Document</title>');
    expect(result.empty).toContain('<body></body>');
    expect(result.empty).not.toContain('dateCreated');

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
