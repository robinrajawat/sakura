import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// Covers the 5 remaining Phase 1 blocks wired in together: escapeHtml, generateId,
// formatRelativeTime, stripSemanticMarkers, serializeMarkdown. Lower risk than the nodeQueries
// cutover — no interleaving with off-limits stateful code, and most call sites needed zero
// changes thanks to thin hand-written wrappers (esc/genDocId/genTemplateId/mnUid) preserving
// the original names. Only computeOutlineNumbers/serializeMarkdown needed real call-site
// updates (6 sites, an appended arg, no reordering). This test exercises the wrappers'
// delegation and the real Markdown-export path against actual app state, not just "did it
// throw".
test.describe('generated Phase 1 batches (escapeHtml/generateId/formatRelativeTime/stripSemanticMarkers/serializeMarkdown)', () => {
  test('wrapper functions delegate correctly and Markdown export produces real output', async ({ page }) => {
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

    // 1. esc() wrapper delegates to the generated escapeHtml() — real HTML-escaping behavior,
    // not just "is a function".
    const escResult = await page.evaluate(() => {
      // @ts-expect-error — bare global from index.html
      return esc('<b>a & b</b>');
    });
    expect(escResult).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');

    // 2. genDocId/genTemplateId/mnUid all delegate to the generated generateId() with the
    // right prefix and suffix length — real id-shape verification, not just "returns a string".
    const idShapes = await page.evaluate(() => {
      // @ts-expect-error
      const d = genDocId();
      // @ts-expect-error
      const t = genTemplateId();
      // @ts-expect-error
      const mn = mnUid();
      return { d, t, mn };
    });
    expect(idShapes.d).toMatch(/^d[0-9a-z]+$/);
    expect(idShapes.t).toMatch(/^t[0-9a-z]+$/);
    expect(idShapes.mn).toMatch(/^mn[0-9a-z]+$/);
    // genDocId/genTemplateId use a 5-char random suffix, mnUid uses 6 — verify the actual
    // random-suffix length survived the cutover (this is the one behavioral difference between
    // the three original functions, deliberately preserved per generateId.ts's own comment).
    const timestampLen = Date.now().toString(36).length;
    expect(idShapes.d.length).toBeGreaterThanOrEqual(1 + timestampLen + 5 - 1);
    expect(idShapes.d.length).toBeLessThanOrEqual(1 + timestampLen + 5 + 1);
    expect(idShapes.mn.length).toBeGreaterThanOrEqual(2 + timestampLen + 6 - 1);
    expect(idShapes.mn.length).toBeLessThanOrEqual(2 + timestampLen + 6 + 1);

    // 3. formatRelativeTime — real relative-time formatting against a fixed point in the past.
    const relTime = await page.evaluate(() => {
      // @ts-expect-error
      return formatRelativeTime(Date.now() - 65_000); // 65s ago
    });
    expect(relTime).toBe('1m ago');

    // 4. stripSemanticMarkers/getNodePlainText — real markup stripping.
    const stripped = await page.evaluate(() => {
      // @ts-expect-error
      return getNodePlainText({ text: '[Section] `code` (aside) [[link]]' });
    });
    expect(stripped).toBe('Section code aside link');

    // 5. serializeMarkdown + computeOutlineNumbers, exercised together with outlineNumbering
    // both on and off — the exact parameter that had to become explicit at every real call
    // site in this cutover. Real multi-depth tree, real Markdown bullet-list output.
    const mdResults = await page.evaluate(() => {
      const testNodes = [
        { id: 1, depth: 0, text: 'A' },
        { id: 2, depth: 1, text: 'A1' },
        { id: 3, depth: 0, text: 'B' }
      ];
      return {
        // @ts-expect-error
        withoutNumbers: serializeMarkdown(testNodes, false, false),
        // @ts-expect-error
        withNumbers: serializeMarkdown(testNodes, false, true)
      };
    });
    expect(mdResults.withoutNumbers).toBe('- A\n  - A1\n- B');
    expect(mdResults.withNumbers).toBe('- 1 A\n  - 1.1 A1\n- 2 B');

    expect(unexpectedErrors).toEqual([]);
  });
});
