import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// hub.html's first FEATURE-DOMAIN slice (hubGenerateId was just an infrastructure pilot).
// Exercises the real, unchanged loadTodosLocal()/saveTodos()/newTodo() wrapper functions
// against real localStorage, in hub.html's own separate script scope.
test.describe('generated hubTodos block (src/state/hubTodos.ts spliced into hub.html)', () => {
  test('newTodo/saveTodos/loadTodosLocal round-trip against real localStorage via the real wrapper functions', async ({ page }) => {
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
      // @ts-expect-error — bare globals from hub.html
      localStorage.removeItem('sakura_todos_v1');

      // @ts-expect-error
      const t1 = newTodo('Buy milk');
      // @ts-expect-error
      const t2 = newTodo('Walk the dog');

      // @ts-expect-error
      todos = [t1, t2];
      // @ts-expect-error
      saveTodos();

      // Confirm the real localStorage entry itself, not just the in-memory array.
      // @ts-expect-error
      const rawAfterSave = JSON.parse(localStorage.getItem('sakura_todos_v1'));

      // Reset in-memory state, then reload from storage — proves the round-trip actually goes
      // through loadTodosLocal(), not just that saveTodos() wrote something.
      // @ts-expect-error
      todos = [];
      // @ts-expect-error
      loadTodosLocal();

      return {
        t1Shape: { text: t1.text, done: t1.done, priority: t1.priority, subtasksOpen: t1.subtasksOpen },
        idsDistinct: t1.id !== t2.id,
        rawAfterSaveLength: rawAfterSave.length,
        rawAfterSaveTexts: rawAfterSave.map((t: any) => t.text),
        // @ts-expect-error
        reloadedTexts: todos.map((t: any) => t.text),
        // @ts-expect-error
        reloadedLength: todos.length
      };
    });

    expect(result.t1Shape).toEqual({ text: 'Buy milk', done: false, priority: 'none', subtasksOpen: true });
    expect(result.idsDistinct).toBe(true);
    expect(result.rawAfterSaveLength).toBe(2);
    expect(result.rawAfterSaveTexts).toEqual(['Buy milk', 'Walk the dog']);
    expect(result.reloadedLength).toBe(2);
    expect(result.reloadedTexts).toEqual(['Buy milk', 'Walk the dog']);

    // Real nextRepeatDate() call, through hub.html's own ambient global (no wrapper needed —
    // fully pure, same name/signature as before the extraction). Added in a follow-up to this
    // slice once identified as pure date arithmetic with no todos-array coupling.
    const repeatResult = await page.evaluate(() => {
      return {
        // @ts-expect-error
        daily: nextRepeatDate('2026-08-21', 'daily'),
        // @ts-expect-error
        weekly: nextRepeatDate('2026-08-21', 'weekly'),
        // Friday 2026-08-21 -> next weekday should skip the weekend to Monday 2026-08-24
        // @ts-expect-error
        weekdaysSkipsWeekend: nextRepeatDate('2026-08-21', 'weekdays')
      };
    });
    expect(repeatResult.daily).toBe('2026-08-22');
    expect(repeatResult.weekly).toBe('2026-08-28');
    expect(repeatResult.weekdaysSkipsWeekend).toBe('2026-08-24');

    // Proof the rest of hub.html's script still runs — an unrelated, physically-distant
    // function is still callable. Same "entire script silently died" check as every other
    // cutover, now proven for hub.html's own separate script scope too.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof todayStr === 'function' && typeof esc === 'function' && typeof jnUid === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
