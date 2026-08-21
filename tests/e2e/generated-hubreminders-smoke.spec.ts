import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubPath = path.resolve(__dirname, '../../hub.html');

// See tests/e2e/generated-presence-smoke.spec.ts for why these are expected/benign here.
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|CORS policy|Failed to load resource|Firebase|firestore/i;

// Fourth Hub feature-domain slice: due-date reminder checking (computeDueRemindersCore,
// src/state/hubReminders.ts). Exercises the real, unchanged checkDueReminders() wrapper — real
// browser permission gating means `remindersEnabled()` is normally false in a fresh headless
// context, so this test overrides it to true (a real top-level `function` binding, reassignable
// at runtime) and installs a spy `Notification` constructor to capture what the wrapper
// actually constructs, rather than mocking computeDueRemindersCore itself — proving the real
// wrapper wires the extracted core's output into the real Notification API correctly.
test.describe('generated hubReminders block (src/state/hubReminders.ts spliced into hub.html)', () => {
  test('checkDueReminders fires real Notification calls for eligible tasks, dedups by day, and the onclick handler opens the right task', async ({ page }) => {
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
      localStorage.removeItem('sakura_reminders_notified');

      // Bypass the real browser permission gate — remindersEnabled() checks
      // Notification.permission==='granted', which a fresh headless context never has. This is
      // a real top-level `function` declaration, so reassigning it overrides the binding for
      // every subsequent call in this same script scope.
      // @ts-expect-error
      remindersEnabled = function () { return true; };

      // Spy Notification constructor — captures what checkDueReminders() actually builds,
      // rather than mocking computeDueRemindersCore, so this proves the real wrapper wires the
      // extracted core's output (title, taskId via the tag) into the real API call shape.
      const constructed: { title: string; tag: string }[] = [];
      let lastInstance: { onclick: (() => void) | null; closed: boolean; close: () => void } | null = null;
      // @ts-expect-error
      window.Notification = function (title: string, opts: { tag: string }) {
        constructed.push({ title, tag: opts.tag });
        const inst = { onclick: null as (() => void) | null, closed: false, close: function (this: { closed: boolean }) { this.closed = true; } };
        lastInstance = inst;
        return inst;
      };

      let openedTaskId: string | null = null;
      // @ts-expect-error
      const origOpenTaskDetail = openTaskDetail;
      // @ts-expect-error
      openTaskDetail = function (id: string) { openedTaskId = id; };
      let focusCalled = false;
      const origFocus = window.focus;
      window.focus = function () { focusCalled = true; };

      // @ts-expect-error
      const today = todayStr();
      const overdueDate = '2020-01-01'; // safely in the past regardless of when this runs
      // @ts-expect-error
      todos = [
        { id: 'due-1', text: 'Overdue task', done: false, dueDate: overdueDate },
        { id: 'due-2', text: 'Done task', done: true, dueDate: overdueDate }, // done: skipped
        { id: 'due-3', text: 'Future task', done: false, dueDate: '2099-01-01' }, // future: skipped
      ];

      // @ts-expect-error
      checkDueReminders();

      const firstRoundConstructedCount = constructed.length;
      // @ts-expect-error
      const notifiedAfterFirst = JSON.parse(localStorage.getItem('sakura_reminders_notified'));

      // Trigger the onclick handler the wrapper actually attached, proving it calls the real
      // openTaskDetail with the right task id and window.focus, then closes the notification.
      // @ts-expect-error
      lastInstance!.onclick();
      const closedAfterClick = lastInstance!.closed;

      // Second call, same day — the already-notified task must NOT fire again.
      // @ts-expect-error
      checkDueReminders();
      const secondRoundConstructedCount = constructed.length;

      // Restore real globals so nothing leaks into later assertions in this same page context.
      window.focus = origFocus;
      // @ts-expect-error
      openTaskDetail = origOpenTaskDetail;

      return {
        constructed,
        firstRoundConstructedCount,
        secondRoundConstructedCount,
        notifiedAfterFirst,
        openedTaskId,
        focusCalled,
        closedAfterClick,
        today,
      };
    });

    expect(result.constructed).toHaveLength(1);
    expect(result.constructed[0].title).toBe('Overdue: Overdue task');
    expect(result.constructed[0].tag).toBe('sakura-todo-due-1');
    expect(result.firstRoundConstructedCount).toBe(1);
    // Second call same day: no new Notification constructed for the already-notified task.
    expect(result.secondRoundConstructedCount).toBe(1);
    expect(result.notifiedAfterFirst).toEqual({ 'due-1': result.today });
    expect(result.openedTaskId).toBe('due-1');
    expect(result.focusCalled).toBe(true);
    // The onclick handler calls n.close() on the real notification instance.
    expect(result.closedAfterClick).toBe(true);

    // Proof the rest of hub.html's script still runs.
    const restOfScriptWorks = await page.evaluate(() => {
      // @ts-expect-error
      return typeof todayStr === 'function' && typeof esc === 'function' && typeof jnUid === 'function';
    });
    expect(restOfScriptWorks).toBe(true);

    expect(unexpectedErrors).toEqual([]);
  });
});
