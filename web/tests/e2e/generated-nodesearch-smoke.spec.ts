import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// A fourth `core/` slice alongside nodeQueries.ts, nodeMutations.ts, and nodeSelection.ts.
// Exercises the real, unchanged computeSearchMatches() wrapper — the same call path openSearch/
// jumpSearch/setSearchMatchCase all use — against a real multi-node tree, not the extracted
// functions directly. Also checks the "entire script silently died" failure mode.
test.describe('generated nodeSearch block (src/core/nodeSearch.ts spliced into index.html)', () => {
  test('computeSearchMatches finds matches, resolves the index, and updates the count against real editor state', async ({ page }) => {
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

    // Build a real tree, run a real search via the real (unchanged) computeSearchMatches()
    // wrapper — the exact call path openSearch() uses — and confirm searchMatches/searchIndex/
    // the on-screen count all reflect it correctly.
    const result = await page.evaluate(() => {
      // @ts-expect-error — bare globals from index.html
      nodes = [
        { id: 1, text: 'Apple pie recipe', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 2, text: 'Banana bread', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false },
        { id: 3, text: 'apple crumble', depth: 0, parentId: null, styles: {}, note: '', noteTitle: '', codeBlock: null, decisionLog: null, tags: [], checked: false, isCheckbox: false, marker: '', slideDivider: false }
      ];
      // @ts-expect-error
      searchQuery = 'apple';
      // @ts-expect-error
      searchMatchCase = false;
      // @ts-expect-error
      searchWholeWord = false;
      // @ts-expect-error
      searchIndex = -1;
      // @ts-expect-error
      computeSearchMatches();

      // @ts-expect-error
      const afterFirstSearch = { matches: searchMatches, index: searchIndex, countText: document.getElementById('search-count')?.textContent };

      // Now narrow the query so the match count shrinks — proves searchIndex gets correctly
      // reset (resolveSearchIndex) rather than left pointing past the end of the new array.
      // @ts-expect-error
      searchQuery = 'apple crumble';
      // @ts-expect-error
      searchIndex = 1; // deliberately stale/out-of-range for what the new query will find
      // @ts-expect-error
      computeSearchMatches();
      // @ts-expect-error
      const afterNarrowedSearch = { matches: searchMatches, index: searchIndex };

      // Clearing the query should reset to no matches / index -1.
      // @ts-expect-error
      searchQuery = '';
      // @ts-expect-error
      computeSearchMatches();
      // @ts-expect-error
      const afterCleared = { matches: searchMatches, index: searchIndex };

      return { afterFirstSearch, afterNarrowedSearch, afterCleared };
    });

    expect(result.afterFirstSearch.matches).toEqual([1, 3]);
    expect(result.afterFirstSearch.index).toBe(0);
    expect(result.afterFirstSearch.countText).toBe('1/2');

    expect(result.afterNarrowedSearch.matches).toEqual([3]);
    expect(result.afterNarrowedSearch.index).toBe(0);

    expect(result.afterCleared.matches).toEqual([]);
    expect(result.afterCleared.index).toBe(-1);

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
