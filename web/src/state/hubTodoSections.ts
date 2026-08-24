/**
 * Hub's To-Dos list-organization logic: the date-label helpers and the urgency-based
 * sectioning/search-filtering decisions behind `renderTodos()` in hub.html
 * (legacy/hub.html:1871-1956). §6.5 slice (docs/phase6-full-parity-plan.md), the
 * "filtering/sorting" half of the To-Dos gap row in docs/history/phase5-parity-checklist.md —
 * see this project's own scoping note in phase6-full-parity-plan.md §6.5 for why "bulk-actions"
 * and "tags" were dropped from that same row's scope instead of built here: neither exists
 * anywhere in legacy's real To-Dos implementation (verified directly against legacy/hub.html
 * and legacy/index.html), so building them would be new capability, not parity.
 *
 * Real DOM construction (`renderTodos`'s own HTML-string building, `swipeRowShell`,
 * `initSwipeList`) stays hand-written in the component, same split as every prior slice.
 * `todayStr()` (legacy/hub.html:1611, a one-line ambient `new Date()` read) is NOT ported
 * as-is here since it isn't independently testable in the way `daysOverdueLabel` etc. are —
 * `today` is instead a plain parameter to every function below, letting the component pass the
 * real value and tests pass a fixed one.
 */

export interface SectionableTodo {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  completedAt: number | null;
}

/** Matches legacy's own `daysOverdueLabel` exactly (legacy/hub.html:1871-1875): the two dates
 * are plain `YYYY-MM-DD` strings, compared via actual `Date` subtraction (not string
 * comparison) so the day count is correct across month/year boundaries. `days<=1` (which also
 * covers 0 and negative, though callers only ever pass genuinely overdue dates) reads as
 * "1 day overdue", matching the original's off-by-design floor. */
export function daysOverdueLabel(dueDate: string, today: string): string {
  const ms = new Date(today + 'T00:00:00').getTime() - new Date(dueDate + 'T00:00:00').getTime();
  const days = Math.round(ms / 86400000);
  return days <= 1 ? '1 day overdue' : days + ' days overdue';
}

/** Matches legacy's own `formatShortDueDate` exactly (legacy/hub.html:1876-1879). */
export function formatShortDueDate(dueDate: string): string {
  const d = new Date(dueDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Matches legacy's own `formatDueDisplay` exactly (legacy/hub.html:1880-1888): "Today"/
 * "Tomorrow"/"Yesterday" for the three adjacent days, otherwise a short weekday+date string. */
export function formatDueDisplay(dueDate: string, today: string): string {
  if (dueDate === today) return 'Today';
  const d = new Date(dueDate + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const days = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Matches legacy's own `relativeCompletedLabel` exactly (legacy/hub.html:1957-1964): empty
 * string for an unset timestamp (a legacy todo completed before `completedAt` existed), then
 * "today"/"yesterday"/"N days ago" up to a week, then a short absolute date. */
export function relativeCompletedLabel(ts: number | null | undefined, now: number = Date.now()): string {
  if (!ts) return '';
  const days = Math.floor((now - ts) / 86400000);
  if (days <= 0) return 'Completed today';
  if (days === 1) return 'Completed yesterday';
  if (days < 7) return 'Completed ' + days + ' days ago';
  return 'Completed ' + new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type TodoSectionLabel = 'Overdue' | 'Today' | 'Upcoming' | 'No Date';

export interface TodoSection<T extends SectionableTodo> {
  label: TodoSectionLabel;
  tasks: T[];
}

/** Matches legacy's own real section-building loop (legacy/hub.html:1923-1939): only open
 * (`!done`) tasks are sectioned, in this fixed label order, each non-empty section sorted by
 * due date ascending except "Today" (single date, no sort needed) and "No Date" (no date to
 * sort by, stays in original array order — matches the original's untouched `push` order).
 * Empty sections are still returned (dropping them is the caller's/renderer's job, same as
 * legacy's own `sections.filter(s=>s.tasks.length)` at render time) so a caller can distinguish
 * "no open tasks at all" from "no tasks in this particular section". */
export function groupOpenTodosCore<T extends SectionableTodo>(todos: T[], today: string): TodoSection<T>[] {
  const sections: TodoSection<T>[] = [
    { label: 'Overdue', tasks: [] },
    { label: 'Today', tasks: [] },
    { label: 'Upcoming', tasks: [] },
    { label: 'No Date', tasks: [] }
  ];
  for (const t of todos) {
    if (t.done) continue;
    if (t.dueDate && t.dueDate < today) sections[0].tasks.push(t);
    else if (t.dueDate === today) sections[1].tasks.push(t);
    else if (t.dueDate && t.dueDate > today) sections[2].tasks.push(t);
    else sections[3].tasks.push(t);
  }
  sections[0].tasks.sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  sections[2].tasks.sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string));
  return sections;
}

/** Matches legacy's own real completed-list ordering (legacy/hub.html:1924, 1952): every done
 * task, newest-completed first (`completedAt` descending; a missing/legacy-null timestamp
 * sorts as if completed at time 0, i.e. last). */
export function sortCompletedTodosCore<T extends SectionableTodo>(todos: T[]): T[] {
  return todos.filter((t) => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}

/** Matches legacy's own real search-mode filtering (legacy/hub.html:1900-1902): case-
 * insensitive substring match against open tasks only (search never surfaces completed tasks,
 * matching the original's `!t.done && ...` guard). An empty/whitespace-only query is the
 * caller's job to treat as "search mode isn't active" (matches the original's own
 * `if(hubSearchQuery)` gate before this filter ever runs) -- this function itself just filters
 * whatever query string it's given. */
export function searchOpenTodosCore<T extends SectionableTodo>(todos: T[], query: string): T[] {
  const q = query.toLowerCase();
  return todos.filter((t) => !t.done && t.text.toLowerCase().indexOf(q) !== -1);
}
