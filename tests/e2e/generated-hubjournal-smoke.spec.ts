import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// hub.html's second FEATURE-DOMAIN slice. Exercises the real, unchanged
// normalizeJournalEntry()/saveJournalEntries()/loadJournalLocal() wrapper functions against
// real IndexedDB (not localStorage — Journal is IndexedDB-backed), in hub.html's own separate
// script scope.
test.describe('generated hubJournal block (src/state/hubJournal.ts spliced into hub.html)', () => {
  test('normalizeJournalEntry validates fields, and saveJournalEntries/loadJournalLocal round-trip via real IndexedDB', async ({ page }) => {
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

    // 1. Real normalizeJournalEntry() call, through the real wrapper — an invalid mood and a
    // missing date should both get corrected.
    const normalizeResult = await page.evaluate(() => {
      // @ts-expect-error — bare globals from hub.html
      return normalizeJournalEntry({ mood: 'not-a-real-mood', body: 'Had a good day' });
    });
    expect(normalizeResult.mood).toBe('');
    expect(normalizeResult.body).toBe('Had a good day');
    expect(typeof normalizeResult.date).toBe('string');
    expect(normalizeResult.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof normalizeResult.id).toBe('string');

    // 2. Real saveJournalEntries()/loadJournalLocal() round-trip through real IndexedDB (not a
    // mock — hub.html's idbGet/idbSet talk to the browser's real IndexedDB).
    const roundTrip = await page.evaluate(async () => {
      // @ts-expect-error
      const entry = normalizeJournalEntry({ date: '2026-08-21', mood: 'good', body: 'Test entry', tags: ['work', 'health'] });
      // @ts-expect-error
      journalEntries = [entry];
      // @ts-expect-error
      await new Promise((resolve) => { saveJournalEntries(); setTimeout(resolve, 200); });

      // Reset in-memory state, then reload from IndexedDB — proves the round-trip actually goes
      // through loadJournalLocal(), not just that saveJournalEntries() wrote something.
      // @ts-expect-error
      journalEntries = [];
      // @ts-expect-error
      await loadJournalLocal();

      return {
        // @ts-expect-error
        reloadedCount: journalEntries.length,
        // @ts-expect-error
        reloadedEntry: journalEntries[0]
      };
    });

    expect(roundTrip.reloadedCount).toBe(1);
    expect(roundTrip.reloadedEntry.date).toBe('2026-08-21');
    expect(roundTrip.reloadedEntry.mood).toBe('good');
    expect(roundTrip.reloadedEntry.body).toBe('Test entry');
    expect(roundTrip.reloadedEntry.tags).toEqual(['work', 'health']);

    // Proof the rest of hub.html's script still runs — an unrelated, physically-distant
    // function is still callable. Same "entire script silently died" check as every other
    // cutover, now proven for hub.html's own separate script scope too.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof todayStr === 'function' && typeof esc === 'function' && typeof todoUid === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
