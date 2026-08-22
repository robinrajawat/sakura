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
});
