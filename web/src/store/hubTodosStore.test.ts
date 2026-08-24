import { describe, expect, it, beforeEach } from 'vitest';
import { useHubTodosStore } from './hubTodosStore';

describe('hubTodosStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useHubTodosStore.setState({ todos: [] });
  });

  it('addTodo appends a new todo', () => {
    useHubTodosStore.getState().addTodo('Buy milk');
    const todos = useHubTodosStore.getState().todos;
    expect(todos).toHaveLength(1);
    expect(todos[0].text).toBe('Buy milk');
    expect(todos[0].done).toBe(false);
  });

  it('addTodo is a no-op for blank/whitespace-only text', () => {
    useHubTodosStore.getState().addTodo('   ');
    expect(useHubTodosStore.getState().todos).toEqual([]);
  });

  it('toggleTodo flips done and sets/clears completedAt', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().toggleTodo(id);
    expect(useHubTodosStore.getState().todos[0].done).toBe(true);
    expect(useHubTodosStore.getState().todos[0].completedAt).not.toBeNull();
    useHubTodosStore.getState().toggleTodo(id);
    expect(useHubTodosStore.getState().todos[0].done).toBe(false);
    expect(useHubTodosStore.getState().todos[0].completedAt).toBeNull();
  });

  it('removeTodo removes the matching todo', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().removeTodo(id);
    expect(useHubTodosStore.getState().todos).toEqual([]);
  });

  it('persists to localStorage on every mutation', () => {
    useHubTodosStore.getState().addTodo('Persisted task');
    const raw = localStorage.getItem('sakura_todos_v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });

  it('cyclePriority cycles none -> low -> med -> high -> none', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      useHubTodosStore.getState().cyclePriority(id);
      seen.push(useHubTodosStore.getState().todos[0].priority);
    }
    expect(seen).toEqual(['low', 'med', 'high', 'none', 'low']);
  });

  it('cycleStatus cycles none -> waiting -> progress -> blocked -> review -> none', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      useHubTodosStore.getState().cycleStatus(id);
      seen.push(useHubTodosStore.getState().todos[0].status);
    }
    expect(seen).toEqual(['waiting', 'progress', 'blocked', 'review', 'none']);
  });

  it('setDueDate sets and clears the due date', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().setDueDate(id, '2026-09-01');
    expect(useHubTodosStore.getState().todos[0].dueDate).toBe('2026-09-01');
    useHubTodosStore.getState().setDueDate(id, null);
    expect(useHubTodosStore.getState().todos[0].dueDate).toBeNull();
  });

  it('cycleRepeat cycles none -> daily -> weekdays -> weekly -> none, storing null for none', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      useHubTodosStore.getState().cycleRepeat(id);
      seen.push(useHubTodosStore.getState().todos[0].repeat);
    }
    expect(seen).toEqual(['daily', 'weekdays', 'weekly', null]);
  });

  it('cycleRepeat is a no-op once the task has subtasks', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().addSubtask(id, 'A subtask');
    useHubTodosStore.getState().cycleRepeat(id);
    expect(useHubTodosStore.getState().todos[0].repeat).toBeNull();
  });

  it('toggleTodo on a repeating task advances its due date instead of marking done', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().setDueDate(id, '2026-09-01');
    useHubTodosStore.getState().cycleRepeat(id); // -> daily
    useHubTodosStore.getState().toggleTodo(id);
    const todo = useHubTodosStore.getState().todos[0];
    expect(todo.done).toBe(false);
    expect(todo.dueDate).toBe('2026-09-02');
  });

  it('addSubtask appends a subtask and clears repeat', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().cycleRepeat(id); // -> daily
    useHubTodosStore.getState().addSubtask(id, 'First subtask');
    const todo = useHubTodosStore.getState().todos[0];
    expect(todo.subtasks).toHaveLength(1);
    expect((todo.subtasks as { text: string }[])[0].text).toBe('First subtask');
    expect(todo.repeat).toBeNull();
  });

  it('addSubtask is a no-op for blank text', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().addSubtask(id, '   ');
    expect(useHubTodosStore.getState().todos[0].subtasks).toEqual([]);
  });

  it('toggleSubtask flips a subtask\'s done flag', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().addSubtask(id, 'Sub');
    const subId = (useHubTodosStore.getState().todos[0].subtasks as { id: string }[])[0].id;
    useHubTodosStore.getState().toggleSubtask(id, subId);
    expect((useHubTodosStore.getState().todos[0].subtasks as { done: boolean }[])[0].done).toBe(true);
    useHubTodosStore.getState().toggleSubtask(id, subId);
    expect((useHubTodosStore.getState().todos[0].subtasks as { done: boolean }[])[0].done).toBe(false);
  });

  it('removeSubtask removes the matching subtask', () => {
    useHubTodosStore.getState().addTodo('Task');
    const id = useHubTodosStore.getState().todos[0].id;
    useHubTodosStore.getState().addSubtask(id, 'Sub');
    const subId = (useHubTodosStore.getState().todos[0].subtasks as { id: string }[])[0].id;
    useHubTodosStore.getState().removeSubtask(id, subId);
    expect(useHubTodosStore.getState().todos[0].subtasks).toEqual([]);
  });

  it('subtask mutations on one todo never affect another todo\'s subtasks array', () => {
    useHubTodosStore.getState().addTodo('Task A');
    useHubTodosStore.getState().addTodo('Task B');
    const [idA, idB] = useHubTodosStore.getState().todos.map((t) => t.id);
    useHubTodosStore.getState().addSubtask(idA, 'Only on A');
    const todos = useHubTodosStore.getState().todos;
    expect(todos.find((t) => t.id === idA)!.subtasks).toHaveLength(1);
    expect(todos.find((t) => t.id === idB)!.subtasks).toEqual([]);
  });

  it('setFocusTodoId sets it, clearFocusTodoId resets it to null', () => {
    expect(useHubTodosStore.getState().focusTodoId).toBeNull();
    useHubTodosStore.getState().setFocusTodoId('t1');
    expect(useHubTodosStore.getState().focusTodoId).toBe('t1');
    useHubTodosStore.getState().clearFocusTodoId();
    expect(useHubTodosStore.getState().focusTodoId).toBeNull();
  });
});
