import { create } from 'zustand';
import { createTodo, loadTodosLocalCore, saveTodosCore, nextRepeatDate, initHubTodosState, type Todo } from '../state/hubTodos';
import { addSubtaskCore, removeSubtaskCore, toggleSubtaskCore, type Subtask } from '../state/hubSubtasks';
import { generateId } from '../utils/generateId';

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
 * Deliberately NOT wired yet, each a real, separately-scoped follow-up: filtering/sorting,
 * bulk actions, tags, PDF export, Version History, Share, due-date reminder notifications (the
 * real `Notification` API + click handler around the already-ported `computeDueRemindersCore`
 * in hubReminders.ts), and legacy's own richer task-detail sheet UI/undo toasts -- this project
 * surfaces the same fields inline per-row instead of a modal sheet, same "honest first pass,
 * simpler chrome" convention every other Pad/Hub slice in this project uses.
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
  }
}));
