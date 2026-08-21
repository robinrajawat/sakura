import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// The first generated block targeting hub.html rather than index.html — proves the generator's
// multi-file support end to end (real splice, real collision check scoped per file, real
// runtime execution in hub.html's own separate script scope) with the lowest possible risk:
// reusing the ALREADY-TESTED generateId.ts source (see tests/unit/generateId.test.ts and
// tests/e2e/generated-phase1-remaining-smoke.spec.ts for the same function's index.html-side
// coverage), rather than introducing new source or new test surface.
test.describe('generated hubGenerateId block (src/utils/generateId.ts spliced into hub.html)', () => {
  test('todoUid/jnUid/subUid produce correctly-prefixed ids via the real wrapper functions', async ({ page }) => {
    const unexpectedErrors: string[] = [];
    page.on('pageerror', (err) => {
      if (!KNOWN_NOISE.test(err.message)) unexpectedErrors.push('pageerror: ' + err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !KNOWN_NOISE.test(msg.text())) {
        unexpectedErrors.push('console.error: ' + msg.text());
      }
    });

    await page.goto('file://' + hubPath);
    await page.waitForTimeout(300);

    const result = await page.evaluate(() => {
      return {
        // @ts-expect-error — bare globals from hub.html
        todo: todoUid(),
        // @ts-expect-error
        journal: jnUid(),
        // @ts-expect-error
        sub: subUid(),
        // @ts-expect-error
        generateIdType: typeof generateId
      };
    });

    expect(result.generateIdType).toBe('function');
    // Prefix + base36 timestamp + 6-char random suffix, matching generateId(prefix, 6) exactly.
    expect(result.todo).toMatch(/^t[0-9a-z]+[0-9a-z]{6}$/);
    expect(result.journal).toMatch(/^jn[0-9a-z]+[0-9a-z]{6}$/);
    expect(result.sub).toMatch(/^sub[0-9a-z]+[0-9a-z]{6}$/);

    // Two calls in immediate succession still produce distinct ids (the random suffix, not
    // just the timestamp, is doing real collision-avoidance work).
    const pair = await page.evaluate(() => {
      // @ts-expect-error
      return [todoUid(), todoUid()];
    });
    expect(pair[0]).not.toBe(pair[1]);

    // Proof the rest of hub.html's script still runs — an unrelated, physically-distant
    // function is still callable. Same "entire script silently died" check as every other
    // cutover, now proven for hub.html's own separate script scope too.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof todayStr === 'function' && typeof esc === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
