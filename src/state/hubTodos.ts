/**
 * Hub's To-Dos storage — the localStorage-backed todo list (create, load, save) that the
 * To-Dos panel in hub.html reads from and writes to.
 *
 * First Hub FEATURE-DOMAIN slice (as opposed to `hubGenerateId`, which was deliberately just an
 * infrastructure pilot proving the generator's multi-file support with zero new logic). Same
 * "extract only the pure, testable core; leave orchestration alone" split used throughout this
 * project for every Phase 2/3 domain: DOM rendering (`renderTodos`) and the swipe-list UI stay
 * hand-written, exactly where they were.
 *
 * Deliberately excluded from this slice, and why:
 * - `findTodo` — a trivial one-line ambient lookup (`todos.find(...)`), no real logic to test,
 *   same reasoning as `getAllAiProviders`/`getAiProviderById` staying out of `aiProviders.ts`.
 * - `renderTodos`/swipe-list wiring — DOM construction, stays hand-written.
 * - Subtask CRUD, due-date reminder checking (real `Notification` API + DOM click handler) —
 *   genuinely separate pieces of the todos domain, not investigated here. `nextRepeatDate` WAS
 *   added in a follow-up pass, once identified as pure date arithmetic with no such coupling.
 *
 * Deliberately no module-level constant for the storage key string (`TODOS_KEY`): hub.html
 * already declares this as a top-level `var`, still read directly by sibling todo functions
 * that remain hand-written. Since a generated block shares hub.html's own script scope,
 * redeclaring the same name here would be a duplicate declaration. The literal value is
 * inlined below instead, with this comment as the single place documenting that it must stay
 * in sync with hub.html's own copy if it ever changes.
 */

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  priority: string;
  status: string;
  dueDate: string | null;
  link: string | null;
  linkLabel: string | null;
  nodeRef: unknown;
  meetingRef: unknown;
  repeat: unknown;
  subtasks: unknown[];
  subtasksOpen: boolean;
}

export interface HubTodosDeps {
  getLocalStorage: () => Storage | null;
  bumpSyncTimestamp: (metaKey: string) => void;
  pushMetaToCloud: (metaKey: string, value: unknown) => void;
  now: () => number;
  generateTodoId: () => string;
}

// Private to this module (deliberately NOT the same name as hub.html's own top-level
// TODOS_KEY — see this file's header comment for why they can't be shared).
const _TODOS_STORAGE_KEY = 'sakura_todos_v1';

let hubTodosDeps: HubTodosDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initHubTodosState(injected: HubTodosDeps): void {
  hubTodosDeps = injected;
}

function requireHubTodosDeps(): HubTodosDeps {
  if (!hubTodosDeps) throw new Error('hubTodos state used before initHubTodosState() was called');
  return hubTodosDeps;
}

/** Pure factory: a fresh todo with the same default field set as the original inline object
 * literal, using injected id/time so the exact values are controllable in tests rather than
 * always live `Date.now()`/random-id calls. */
export function createTodo(text: string): Todo {
  const d = requireHubTodosDeps();
  return {
    id: d.generateTodoId(),
    text,
    done: false,
    createdAt: d.now(),
    completedAt: null,
    priority: 'none',
    status: 'none',
    dueDate: null,
    link: null,
    linkLabel: null,
    nodeRef: null,
    meetingRef: null,
    repeat: null,
    subtasks: [],
    subtasksOpen: true
  };
}

/** Reads the full todos list, never throwing — a missing or corrupt localStorage entry behaves
 * the same as an empty list, matching the original's try/catch-everything behavior. */
export function loadTodosLocalCore(): Todo[] {
  try {
    const ls = requireHubTodosDeps().getLocalStorage();
    const raw = ls ? ls.getItem(_TODOS_STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Writes the full todos list and fires the same two real side effects the original did:
 * bumping the local sync timestamp and pushing to cloud sync, both injected — this module
 * doesn't reimplement sync logic, only triggers it the same way the original did. Returns
 * whether the localStorage write itself succeeded, so a caller can show the original's
 * "device storage may be full" toast on failure — the original showed that toast from inside
 * this function's own `catch`, but toast display is DOM/UI, so it's returned as a boolean
 * here instead and left to the hand-written wrapper to act on. */
export function saveTodosCore(todos: Todo[]): boolean {
  const d = requireHubTodosDeps();
  try {
    const ls = d.getLocalStorage();
    if (ls) ls.setItem(_TODOS_STORAGE_KEY, JSON.stringify(todos));
    d.bumpSyncTimestamp('todos');
    d.pushMetaToCloud('todos', todos);
    return true;
  } catch {
    return false;
  }
}

/** Pure: the next due date for a repeating todo, given the date it was last due (or `null` to
 * mean "today") and a repeat mode. `'daily'` advances one day, `'weekly'` advances seven,
 * `'weekdays'` advances one day at a time until landing on a non-weekend day (so a Friday task
 * repeats to the following Monday, not Saturday) — matching hub.html's own comment that this
 * mirrors index.html's `nextRepeatDate()` exactly. Any other `repeat` value is a no-op (returns
 * the same date formatted back out), matching the original's fall-through behavior. */
export function nextRepeatDate(fromDateStr: string | null | undefined, repeat: string | null | undefined): string {
  const d = fromDateStr ? new Date(fromDateStr + 'T00:00:00') : new Date(new Date().setHours(0, 0, 0, 0));
  if (repeat === 'daily') {
    d.setDate(d.getDate() + 1);
  } else if (repeat === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (repeat === 'weekdays') {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
