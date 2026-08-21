/**
 * Hub's due-date reminder checking — the decision logic behind `checkDueReminders()` in
 * hub.html: given the current todo list, today's date, and the "already notified today" map,
 * which tasks need a browser Notification fired right now, and what should the updated
 * notified map look like afterward.
 *
 * Fourth Hub feature-domain slice, after `hubTodos.ts`/`hubJournal.ts`/`hubSubtasks.ts`.
 * Revisits the "due-date reminder checking (real `Notification` API + DOM click handler)"
 * domain flagged as not-yet-investigated in `hubTodos.ts`'s own header. The real `Notification`
 * construction, its `onclick` handler (`window.focus()`, `openTaskDetail()` — real DOM/window
 * APIs), and the `localStorage` read/write around the notified map all stay hand-written in the
 * wrapper, exactly the split every prior slice uses — this module owns only the filtering and
 * per-day dedup logic, which was genuinely tangled together with the real Notification
 * construction inside a single `forEach` in the original.
 *
 * A behavior worth calling out, preserved deliberately rather than "fixed": the original marks
 * a task as notified (`notified[t.id]=today`) UNCONDITIONALLY after the `try{ new
 * Notification(...) }catch(e){}` block — even if constructing the real Notification throws
 * (e.g. an unexpected runtime error), the task still gets marked as notified for today and
 * won't be retried until tomorrow. This module can't reproduce "did the real Notification
 * constructor throw" (that's the wrapper's job, using the real API), so it deliberately always
 * marks every task it decides is due for a reminder as notified in the returned map, matching
 * the original's actual behavior rather than a "more correct" retry-on-failure version it never
 * had.
 *
 * Explicitly NOT extracted here, and why:
 * - `remindersEnabled`/`updateRemindersLabel`/`loadNotifiedMap`/`saveNotifiedMap` — trivial
 *   one-line-plus-try/catch ambient localStorage/Notification-API reads, no real logic to test,
 *   same reasoning as `getAllAiProviders` staying out of `aiProviders.ts`.
 * - The actual `new Notification(...)` construction and its `onclick` handler — real
 *   side-effecting browser API calls, stays hand-written.
 * - `isIOS`/`isStandaloneDisplay` — simple ambient `navigator`/`window` reads with no
 *   meaningful decision logic of their own, same reasoning as the storage-read functions above.
 */

export interface ReminderTask {
  id: string;
  done: boolean;
  dueDate: string | null;
  text: string;
}

export interface DueReminder {
  taskId: string;
  /** The exact notification title the original constructed — `'Overdue: '+text` or
   * `'Due today: '+text` — computed here so the wrapper only needs to pass it straight into
   * `new Notification(title, {...})`, never re-deriving the overdue/due-today distinction. */
  title: string;
}

export interface ComputeDueRemindersResult {
  /** Tasks that need a reminder fired right now, in the same order they appear in `todos` —
   * matching the original's plain `forEach` iteration order. */
  reminders: DueReminder[];
  /** A NEW notified-map object (the input is never mutated) with every task in `reminders`
   * marked as notified for `today` — ready to hand straight to `saveNotifiedMap()`. */
  notifiedMap: Record<string, string>;
}

/** Pure: computes which tasks are due/overdue and not yet notified today, and the resulting
 * notified map. A task is skipped (no reminder, `notifiedMap` unchanged for it) if: it's
 * already done; it has no due date; its due date is still in the future (`dueDate > today`);
 * or it was already notified today (`notifiedMap[id] === today`) — all four conditions match
 * the original's exact `if(t.done || !t.dueDate || t.dueDate>today)return;` / `if(notified[t.id]
 * ===today)return;` guards. `dueDate`/`today` are plain `YYYY-MM-DD` strings compared
 * lexicographically, same as the original (valid because that format sorts the same
 * lexicographically as chronologically). */
export function computeDueRemindersCore(
  todos: ReminderTask[],
  today: string,
  notifiedMap: Record<string, string>
): ComputeDueRemindersResult {
  const updated: Record<string, string> = { ...notifiedMap };
  const reminders: DueReminder[] = [];
  for (const t of todos) {
    if (t.done || !t.dueDate || t.dueDate > today) continue;
    if (updated[t.id] === today) continue;
    const title = t.dueDate < today ? 'Overdue: ' + t.text : 'Due today: ' + t.text;
    reminders.push({ taskId: t.id, title });
    updated[t.id] = today;
  }
  return { reminders, notifiedMap: updated };
}
