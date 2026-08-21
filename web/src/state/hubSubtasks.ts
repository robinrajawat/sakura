/**
 * Hub's subtask CRUD — the toggle/remove/add operations behind each todo's subtask list
 * (`task-detail-subtasks` panel in hub.html), currently three separate click/keydown event
 * listeners each fusing a one-to-few-line mutation with real orchestration (`saveTodos()`,
 * `renderTodos()`, `renderTaskDetail()`).
 *
 * Third Hub feature-domain slice, after `hubTodos.ts`/`hubJournal.ts`'s storage layers.
 * `hubTodos.ts`'s own header flagged this as "genuinely separate... not investigated" at the
 * time — investigated here. Each operation's actual logic is small (flip a boolean, filter an
 * array, push an object) but real enough to be worth pinning: `addSubtaskCore` in particular
 * has two behaviors easy to silently break during a future edit — the 300-character truncation,
 * and clearing the parent task's `repeat` (subtasks and repeat are mutually exclusive in the
 * UI: adding a subtask always clears repeat, matching the original's `t.repeat=null`).
 *
 * Same in-place-mutation convention as `nodeMutations.ts`/`tabOrder.ts`/`diagramAnchor.ts`:
 * each function mutates the passed-in `task` (and its `subtasks` array) directly rather than
 * returning a new object, since a plain function parameter can't reassign the caller's own
 * `todos` array element the way a global assignment could.
 *
 * `subUid` (from `src/utils/generateId.ts` via the `hubGenerateId` block, already spliced into
 * hub.html) is referenced as an ambient global via `declare function` below — the same
 * type-erased pattern `nodeMutations.ts` uses for `nodeQueries.ts`'s `getSubtreeEnd`/`getIndex`,
 * valid here because `hubGenerateId` is itself an already-generated block sharing hub.html's
 * one script scope, not hand-written code (that distinction is why `templatesApply.ts` used
 * dependency injection for `makeNode` instead — see that module's own header for why the two
 * patterns aren't interchangeable).
 *
 * Explicitly NOT extracted here, and why:
 * - The three DOM event listeners themselves (element lookup, `closest()` hit-testing, reading/
 *   clearing the input's value, `saveTodos()`/`renderTodos()`/`renderTaskDetail()` calls) — real
 *   orchestration, stays hand-written, same split as every prior slice.
 * - `renderTaskSubtasks`/`renderTaskChips` — DOM construction, stays hand-written.
 * - Due-date reminders (real `Notification` API + DOM click handler) — a genuinely separate
 *   piece of the todos domain, still not investigated; left for its own future slice.
 */

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

/** The subset of a real Todo this module reads/writes. Intentionally loose (not importing
 * hubTodos.ts's own Todo type) since this module only touches `subtasks` and `repeat`. */
export interface SubtaskHost {
  subtasks?: Subtask[];
  repeat?: unknown;
}

declare function subUid(): string;

/** Pure (beyond the in-place mutation): flips the `done` flag of the subtask with the given id,
 * if found. Returns whether a matching subtask was found and toggled — the original's inline
 * logic silently did nothing for a not-found id (the `if(!sub)return;` guard in its caller),
 * preserved here by simply not mutating anything in that case rather than throwing. */
export function toggleSubtaskCore(task: SubtaskHost, subtaskId: string): boolean {
  const sub = (task.subtasks || []).find((s) => s.id === subtaskId);
  if (!sub) return false;
  sub.done = !sub.done;
  return true;
}

/** Pure (beyond the in-place mutation): removes the subtask with the given id, if present.
 * Returns whether a matching subtask was actually removed (the length changed) — same
 * not-found-is-a-silent-no-op behavior as the original. */
export function removeSubtaskCore(task: SubtaskHost, subtaskId: string): boolean {
  const before = task.subtasks || [];
  const after = before.filter((s) => s.id !== subtaskId);
  task.subtasks = after;
  return after.length !== before.length;
}

/** Pure (beyond the in-place mutation): appends a new subtask built from raw input text, and
 * clears the task's `repeat` (subtasks and repeat are mutually exclusive in the UI — matches
 * the original's unconditional `t.repeat=null` on every successful add, not just when repeat
 * was already set). Mirrors the original's exact validation order: trim first, bail out on an
 * empty result WITHOUT touching `subtasks`/`repeat` at all (same as the original's
 * `if(!val)return;` before ever reaching `t.subtasks.push(...)`), then truncate to 300
 * characters — the same limit the real `<input maxlength="300">` already enforces client-side,
 * pinned here too since this function doesn't get that limit for free. Returns the newly-added
 * subtask (or `null` if the input was empty/whitespace-only), so the caller can do the same
 * `document.getElementById('task-subtask-input').focus()` follow-up. */
export function addSubtaskCore(task: SubtaskHost, rawText: string): Subtask | null {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return null;
  if (!task.subtasks) task.subtasks = [];
  const sub: Subtask = { id: subUid(), text: trimmed.slice(0, 300), done: false };
  task.subtasks.push(sub);
  task.repeat = null;
  return sub;
}
