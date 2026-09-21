import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource/i;

// First slice of the Decision Log domain — normalizeDecisionLog. Exercises the real, unchanged
// wrapper function — not the extracted *Core function directly — plus its one real call site
// inside normalizeNode, to prove both still resolve correctly after the splice.
test.describe('generated decisionLog block (src/state/decisionLog.ts spliced into index.html)', () => {
  test('normalizeDecisionLog works through the real wrapper function, and normalizeNode still calls it correctly', async ({ page }) => {
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
      // @ts-expect-error — bare global from index.html
      const direct = normalizeDecisionLog({ context: 'ctx', status: 'APPROVED', timestamp: 123 });

      // Real call site: normalizeNode's own legacy decisionLog-field normalization.
      // @ts-expect-error
      const normalized = normalizeNode({
        id: 1,
        text: 'A node',
        decisionLog: { decision: 'Ship it', status: 'rejected', timestamp: 'not-a-number' }
      });

      return {
        directStatus: direct.status,
        directContext: direct.context,
        nodeDecisionLogDecision: normalized.decisionLog.decision,
        nodeDecisionLogStatus: normalized.decisionLog.status,
        nodeDecisionLogTimestamp: normalized.decisionLog.timestamp
      };
    });

    expect(result.directStatus).toBe('approved');
    expect(result.directContext).toBe('ctx');
    expect(result.nodeDecisionLogDecision).toBe('Ship it');
    expect(result.nodeDecisionLogStatus).toBe('rejected');
    expect(result.nodeDecisionLogTimestamp).toBeNull();

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
