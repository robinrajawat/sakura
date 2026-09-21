import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Phase 3's second feature-domain slice. Exercises the real generated block (computeLoadedAiPrefs
// / loadAiPrefsCore / saveAiPrefsCore) through the real, unchanged loadAiPrefs()/saveAiPrefs()
// wrapper functions in index.html — same call sites the app itself uses — against real
// localStorage, not a mock. Also checks for the "entire script silently died" failure mode (an
// unrelated later function still being callable proves the whole script executed).
test.describe('generated aiProviders block (src/state/aiProviders.ts spliced into index.html)', () => {
  test('loadAiPrefs/saveAiPrefs round-trip against real localStorage via the real wrapper functions', async ({ page }) => {
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

    // Full round-trip against REAL localStorage, through the real (unchanged, hand-written)
    // loadAiPrefs()/saveAiPrefs() wrapper functions — exactly the call path the AI settings
    // panel uses. Clears any pre-existing state under this key first so the test is
    // deterministic regardless of what else has run in this page.
    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      localStorage.removeItem('sakura_ai_prefs_v1');

      // @ts-expect-error
      aiProvider = 'claude';
      // @ts-expect-error
      aiModel = 'claude-sonnet-test';
      // @ts-expect-error
      aiRewritePrompt = 'my custom rewrite prompt';
      // @ts-expect-error
      saveAiPrefs();

      // Confirm the real localStorage entry itself, not just the in-memory state.
      // @ts-expect-error
      const rawAfterSave = JSON.parse(localStorage.getItem('sakura_ai_prefs_v1'));

      // Reset in-memory state to something else, then reload from storage — proves the
      // stored values actually round-trip back through loadAiPrefs(), not just that save wrote
      // something.
      // @ts-expect-error
      aiProvider = 'gemini';
      // @ts-expect-error
      aiModel = 'gemini-3.5-flash';
      // @ts-expect-error
      aiRewritePrompt = 'default';
      // @ts-expect-error
      loadAiPrefs();

      return {
        rawAfterSave,
        // @ts-expect-error
        reloadedProvider: aiProvider,
        // @ts-expect-error
        reloadedModel: aiModel,
        // @ts-expect-error
        reloadedPrompt: aiRewritePrompt
      };
    });

    expect(result.rawAfterSave.provider).toBe('claude');
    expect(result.rawAfterSave.model).toBe('claude-sonnet-test');
    expect(result.rawAfterSave.prompt).toBe('my custom rewrite prompt');
    expect(result.rawAfterSave.modelByProvider.claude).toBe('claude-sonnet-test');
    expect(result.reloadedProvider).toBe('claude');
    expect(result.reloadedModel).toBe('claude-sonnet-test');
    expect(result.reloadedPrompt).toBe('my custom rewrite prompt');

    // A stored provider id that no longer exists is ignored on load, falling back to whatever
    // was already in memory — the exact validation behavior this slice preserves from the
    // original inline logic.
    const staleProviderResult = await page.evaluate(() => {
      // @ts-expect-error
      localStorage.setItem('sakura_ai_prefs_v1', JSON.stringify({ provider: 'no-longer-exists', model: 'x' }));
      // @ts-expect-error
      aiProvider = 'openai';
      // @ts-expect-error
      loadAiPrefs();
      // @ts-expect-error
      return aiProvider;
    });
    expect(staleProviderResult).toBe('openai');

    // Proof the rest of the script still runs — an unrelated, physically-distant function
    // (defined tens of thousands of characters later in the file) is still callable. This is
    // exactly the check that would have caught the serializeMarkdown import-statement bug: a
    // syntax error anywhere in the script kills everything after it, not just the broken block.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof getSelectionRangeIds === 'function' && typeof esc === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
