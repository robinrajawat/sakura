import { create } from 'zustand';
import { createTodo, loadTodosLocalCore, saveTodosCore, initHubTodosState, type Todo } from '../state/hubTodos';
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

interface HubTodosState {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub To-Dos. Wraps the real ported
 * createTodo/loadTodosLocalCore/saveTodosCore (Phase 1, unused until now) with a thin Zustand
 * layer -- every mutation re-saves the full list via saveTodosCore, matching hub.html's own
 * "load once, mutate in memory, save the whole list back" pattern. Subtasks (hubSubtasks.ts,
 * also already ported) and due-date reminders (hubReminders.ts) are deferred to their own
 * follow-up slices -- this one is create/toggle/delete only.
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
    const todos = get().todos.map((t) =>
      t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : null } : t
    );
    saveTodosCore(todos);
    set({ todos });
  },

  removeTodo: (id) => {
    const todos = get().todos.filter((t) => t.id !== id);
    saveTodosCore(todos);
    set({ todos });
  }
}));
