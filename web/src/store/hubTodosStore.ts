import { create } from 'zustand';
import { createTodo, loadTodosLocalCore, saveTodosCore, nextRepeatDate, initHubTodosState, type Todo } from '../state/hubTodos';
import { addSubtaskCore, removeSubtaskCore, toggleSubtaskCore, type Subtask } from '../state/hubSubtasks';
import { computeDueRemindersCore } from '../state/hubReminders';
import { generateId } from '../utils/generateId';

// Matches legacy's own real todayStr() exactly (legacy/hub.html:1611) -- local calendar date
// parts, deliberately NOT `toISOString().slice(0,10)`, which reads UTC and would report the
// wrong day for part of the day in any timezone ahead of UTC.
export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Matches legacy's own real storage keys exactly (legacy/hub.html:698-699).
const REMINDERS_ENABLED_KEY = 'sakura_reminders_enabled';
const REMINDERS_NOTIFIED_KEY = 'sakura_reminders_notified';

function readRemindersEnabled(): boolean {
  try {
    return (
      localStorage.getItem(REMINDERS_ENABLED_KEY) === '1' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    );
  } catch {
    return false;
  }
}

function loadNotifiedMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(REMINDERS_NOTIFIED_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveNotifiedMap(m: Record<string, string>): void {
  try {
    localStorage.setItem(REMINDERS_NOTIFIED_KEY, JSON.stringify(m));
  } catch {
    // matches legacy's own silent-swallow on write failure
  }
}

// Real browser dependencies for the ported hubTodos.ts core -- cloud sync hooks are no-ops
// since no Firebase/backend exists in web/ yet (Phase 4's "account/sync features" is where
// that gets tackled directly, not silently absorbed into this slice).
initHubTodosState({
  getLocalStorage: () => (typeof localStorage !== 'undefined' ? localStorage : null),
  bumpSyncTimestamp: () => {},
  pushMetaToCloud: () => {},
  now: () => Date.now(),
  generateTodoId: () => generateId('todo')
});

// Matches legacy's own real TODO_STATUS_CYCLE/TODO_PRIORITY_CYCLE/TODO_REPEAT_CYCLE exactly
// (legacy/hub.html:2158-2160). 'none' means "unset" throughout -- status/priority store the
// literal string 'none' on the Todo (matching hubTodos.ts's own createTodo default), while
// repeat stores `null` for "unset" (matching legacy's own `t.repeat=next==='none'?null:next`).
const STATUS_CYCLE = ['none', 'waiting', 'progress', 'blocked', 'review'];
const PRIORITY_CYCLE = ['none', 'low', 'med', 'high'];
const REPEAT_CYCLE = ['none', 'daily', 'weekdays', 'weekly'];

export const TODO_STATUS_LABEL: Record<string, string> = { waiting: 'Waiting', progress: 'In Progress', blocked: 'Blocked', review: 'Review' };
export const TODO_PRIORITY_LABEL: Record<string, string> = { low: 'Low', med: 'Medium', high: 'High' };
export const TODO_REPEAT_LABEL: Record<string, string> = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly' };

// Matches legacy's own real cycleNext(arr,current) exactly (legacy/hub.html:2161-2164) -- too
// trivial a one-line array-cycle to be worth its own tested pure module, same reasoning
// hubTodos.ts's own header gives for excluding findTodo.
function cycleNext(arr: string[], current: string | null | undefined): string {
  const idx = arr.indexOf(current || 'none');
  return arr[(idx === -1 ? 0 : idx + 1) % arr.length];
}

interface HubTodosState {
  todos: Todo[];
  addTodo: (text: string) => void;
  /** Matches legacy's real `addTodoExternal` (legacy/index.html:43807-43817), currently used
   * only by Meeting Notes' "Promote to To-Do". Returns the new todo's id (or `null` if `text`
   * is empty/whitespace-only) so the caller can remember which todo an action item became. */
  addTodoFromMeeting: (text: string, meetingCtx: { meetingId: string; title: string; date: string | null }) => string | null;
  /** Checking a repeating task advances its due date instead of marking it done -- matches
   * legacy's own real completeTaskAnimated exactly (legacy/hub.html:2071-2082): a repeating
   * task never actually reaches `done:true` through this path, it just rolls its due date
   * forward via the already-ported `nextRepeatDate`. Unchecking (or completing a non-repeating
   * task) behaves exactly as before. Legacy also shows an undo toast for the repeat-advance
   * case -- this project has no toast system yet, so that part is deliberately not ported. */
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  cyclePriority: (id: string) => void;
  cycleStatus: (id: string) => void;
  setDueDate: (id: string, dueDate: string | null) => void;
  /** No-op if the task has any subtasks -- matches legacy's own real mutual-exclusion guard
   * (legacy/hub.html:2336-2341: the repeat chip's click handler returns early when
   * `(t.subtasks||[]).length>0`, same as `addSubtaskCore` clearing `repeat` on the other side
   * of this exclusion). */
  cycleRepeat: (id: string) => void;
  addSubtask: (id: string, text: string) => void;
  toggleSubtask: (id: string, subtaskId: string) => void;
  removeSubtask: (id: string, subtaskId: string) => void;

  /** Live search-box text -- matches legacy's own `hubSearchQuery` (empty string/falsy means
   * "search mode isn't active", same as the original). */
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  /** Matches legacy's own `todoCompletedOpen` -- whether the collapsed "Completed (N)" section
   * is expanded. */
  completedOpen: boolean;
  toggleCompletedOpen: () => void;

  /** Matches legacy's own real on/off state, re-derived from localStorage + live
   * `Notification.permission` on every read rather than cached, same as `remindersEnabled()`
   * (legacy/hub.html:700-702) -- so a permission revoked from browser settings between renders
   * is reflected immediately rather than needing an explicit toggle to notice. */
  remindersEnabled: () => boolean;
  /** Matches legacy's real toggle handler (legacy/hub.html:796-827): turning on requests
   * Notification permission first (a no-op resolved promise if already granted/denied is
   * handled below); turning off just flips the stored flag. Returns a short status message for
   * the caller to show as a toast, mirroring every real `showToast(...)` call the original
   * makes from this same handler -- this project has no toast system yet (same gap
   * `hubTodosStore.ts`'s own header already names for the repeat-advance undo toast), so the
   * message is handed back rather than displayed directly. */
  toggleReminders: () => Promise<string>;
  /** Matches legacy's real `checkDueReminders()` (legacy/hub.html:775-789): fires a real
   * browser Notification for every task newly due/overdue since the last check, then persists
   * the updated notified-map. No-ops entirely if reminders aren't enabled, same as the
   * original's own early return. Clicking a fired notification sets `focusTodoId` instead of
   * calling `openTaskDetail()` directly (no such global function here) -- the component reads
   * that field to expand the matching row's Details section. */
  checkDueReminders: () => void;
  focusTodoId: string | null;
  clearFocusTodoId: () => void;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub To-Dos. Wraps the real ported
 * createTodo/loadTodosLocalCore/saveTodosCore (Phase 1, unused until now) with a thin Zustand
 * layer -- every mutation re-saves the full list via saveTodosCore, matching hub.html's own
 * "load once, mutate in memory, save the whole list back" pattern.
 *
 * Phase 6.5 slice (docs/phase6-full-parity-plan.md §6.5), first piece: priority/status/due-
 * dates/repeat/subtasks. Wires fields that were already real on the ported `Todo` type
 * (hubTodos.ts) but unused until now, plus the already-ported `nextRepeatDate`
 * (hubTodos.ts) and subtask CRUD (`addSubtaskCore`/`toggleSubtaskCore`/`removeSubtaskCore`,
 * hubSubtasks.ts) -- all of it existing, tested Phase 1 logic getting a real UI for the first
 * time, same pattern the Diagrams Generate button used. Every subtask mutation clones the
 * target todo (and its `subtasks` array) before calling the in-place-mutating core function,
 * since Zustand state must never be mutated directly -- the core functions themselves mutate
 * their `task` argument by design (see hubSubtasks.ts's own header on why), so the clone is
 * this wrapper's responsibility, not theirs.
 *
 * §6.5 second slice (docs/phase6-full-parity-plan.md): search filtering, urgency-based
 * sectioning (Overdue/Today/Upcoming/No Date, `hubTodoSections.ts`), the collapsible sorted
 * Completed section, and due-date reminder notifications (the real `Notification` API + click
 * handler around the already-ported `computeDueRemindersCore` in hubReminders.ts) are all wired
 * below. "Bulk actions" and "tags", also named in this row of
 * docs/history/phase5-parity-checklist.md, are deliberately NOT built: verified directly against
 * legacy/hub.html and legacy/index.html, neither exists anywhere in legacy's real To-Dos
 * implementation (no todo ever has a `tags` field; the only real bulk-select UI in legacy is on
 * Diagrams/Q&A/sidebar/trash, not To-Dos) -- building them would be new capability, not parity,
 * the same category error this plan's own AI-key-vault appendix warns against elsewhere. PDF
 * export/Version History/Share stay deferred to §6.6/§6.8 respectively, where the actual
 * cross-cutting infrastructure for each is being built once for every surface rather than
 * separately per Hub tab.
 *
 * Legacy's own richer modal task-detail sheet stays out of scope too, same "honest first pass,
 * simpler chrome" convention every other Pad/Hub slice in this project uses -- fields surface
 * inline per-row instead. The reminders on/off toggle likewise has no Account/Settings panel to
 * live in yet (none exists in web/'s Hub at all), so it's placed directly in this panel's own
 * header as a documented placement decision, not a deferral.
 */
export const useHubTodosStore = create<HubTodosState>((set, get) => ({
  todos: loadTodosLocalCore(),

  addTodo: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const todos = [...get().todos, createTodo(trimmed)];
    saveTodosCore(todos);
    set({ todos });
  },

  addTodoFromMeeting: (text, meetingCtx) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const todo = createTodo(trimmed);
    // Matches legacy's real addTodoExternal exactly (legacy/index.html:43807-43817): the
    // meeting's own date becomes the new task's due date (only when it's a real YYYY-MM-DD
    // string), and the meeting id+title (truncated to 160 chars, matching the original) become
    // a `meetingRef` for a future "from meeting" chip -- no such chip UI exists yet in this
    // project's To-Dos panel (a real, separately-scoped follow-up), but the data itself is
    // preserved so it isn't lost once that UI does land.
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(meetingCtx.date || '') ? meetingCtx.date : null;
    const meetingRef = meetingCtx.meetingId ? { meetingId: meetingCtx.meetingId, title: (meetingCtx.title || '').slice(0, 160) } : null;
    const withMeeting: Todo = { ...todo, dueDate, meetingRef };
    const todos = [...get().todos, withMeeting];
    saveTodosCore(todos);
    set({ todos });
    return withMeeting.id;
  },

  toggleTodo: (id) => {
    const todos = get().todos;
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    if (!todo.done && todo.repeat) {
      const updated = todos.map((t) =>
        t.id === id ? { ...t, dueDate: nextRepeatDate(t.dueDate, t.repeat as string) } : t
      );
      saveTodosCore(updated);
      set({ todos: updated });
      return;
    }
    const updated = todos.map((t) =>
      t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t
    );
    saveTodosCore(updated);
    set({ todos: updated });
  },

  removeTodo: (id) => {
    const todos = get().todos.filter((t) => t.id !== id);
    saveTodosCore(todos);
    set({ todos });
  },

  cyclePriority: (id) => {
    const todos = get().todos.map((t) => (t.id === id ? { ...t, priority: cycleNext(PRIORITY_CYCLE, t.priority) } : t));
    saveTodosCore(todos);
    set({ todos });
  },

  cycleStatus: (id) => {
    const todos = get().todos.map((t) => (t.id === id ? { ...t, status: cycleNext(STATUS_CYCLE, t.status) } : t));
    saveTodosCore(todos);
    set({ todos });
  },

  setDueDate: (id, dueDate) => {
    const todos = get().todos.map((t) => (t.id === id ? { ...t, dueDate: dueDate || null } : t));
    saveTodosCore(todos);
    set({ todos });
  },

  cycleRepeat: (id) => {
    const todos = get().todos;
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    if (((todo.subtasks as Subtask[]) || []).length > 0) return;
    const next = cycleNext(REPEAT_CYCLE, todo.repeat as string | null);
    const updated = todos.map((t) => (t.id === id ? { ...t, repeat: next === 'none' ? null : next } : t));
    saveTodosCore(updated);
    set({ todos: updated });
  },

  addSubtask: (id, text) => {
    const todos = get().todos;
    const idx = todos.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const clone = { ...todos[idx], subtasks: [...((todos[idx].subtasks as Subtask[]) || [])] };
    const added = addSubtaskCore(clone, text);
    if (!added) return;
    const updated = [...todos];
    updated[idx] = clone;
    saveTodosCore(updated);
    set({ todos: updated });
  },

  toggleSubtask: (id, subtaskId) => {
    const todos = get().todos;
    const idx = todos.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const clone = { ...todos[idx], subtasks: [...((todos[idx].subtasks as Subtask[]) || [])] };
    const changed = toggleSubtaskCore(clone, subtaskId);
    if (!changed) return;
    const updated = [...todos];
    updated[idx] = clone;
    saveTodosCore(updated);
    set({ todos: updated });
  },

  removeSubtask: (id, subtaskId) => {
    const todos = get().todos;
    const idx = todos.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const clone = { ...todos[idx], subtasks: [...((todos[idx].subtasks as Subtask[]) || [])] };
    const changed = removeSubtaskCore(clone, subtaskId);
    if (!changed) return;
    const updated = [...todos];
    updated[idx] = clone;
    saveTodosCore(updated);
    set({ todos: updated });
  },

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  completedOpen: false,
  toggleCompletedOpen: () => set((s) => ({ completedOpen: !s.completedOpen })),

  remindersEnabled: () => readRemindersEnabled(),

  toggleReminders: async () => {
    if (typeof Notification === 'undefined') {
      return "Notifications aren't supported on this browser.";
    }
    const currentlyOn = readRemindersEnabled();
    if (currentlyOn) {
      try {
        localStorage.setItem(REMINDERS_ENABLED_KEY, '0');
      } catch {
        // matches legacy's own silent-swallow on write failure
      }
      return 'Reminders turned off.';
    }
    if (Notification.permission === 'denied') {
      return 'Notifications are blocked for Sakura in your browser settings.';
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      try {
        localStorage.setItem(REMINDERS_ENABLED_KEY, '1');
      } catch {
        // matches legacy's own silent-swallow on write failure
      }
      get().checkDueReminders();
      return 'Reminders turned on — works while Sakura is open.';
    }
    return 'Notification permission was not granted.';
  },

  checkDueReminders: () => {
    if (!readRemindersEnabled()) return;
    const today = todayStr();
    const notified = loadNotifiedMap();
    const result = computeDueRemindersCore(get().todos, today, notified);
    result.reminders.forEach((r) => {
      try {
        const n = new Notification(r.title, {
          body: 'Sakura To-Dos',
          tag: 'sakura-todo-' + r.taskId,
          icon: '/icon-192-pwa.png'
        });
        n.onclick = () => {
          try {
            window.focus();
          } catch {
            // matches legacy's own silent-swallow
          }
          set({ focusTodoId: r.taskId });
          n.close();
        };
      } catch {
        // matches legacy's own silent-swallow if the real Notification constructor throws
      }
    });
    saveNotifiedMap(result.notifiedMap);
  },

  focusTodoId: null,
  clearFocusTodoId: () => set({ focusTodoId: null })
}));
