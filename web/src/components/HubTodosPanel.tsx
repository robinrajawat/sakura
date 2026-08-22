import { useState } from 'react';
import { useHubTodosStore } from '../store/hubTodosStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub To-Dos panel. Create/toggle/delete
 * only -- subtasks, due dates, priority, and repeat are all real fields on the ported `Todo`
 * type (hubTodos.ts) but not yet surfaced in this UI, each a real, separately-scoped follow-up.
 */
export function HubTodosPanel() {
  const todos = useHubTodosStore((s) => s.todos);
  const addTodo = useHubTodosStore((s) => s.addTodo);
  const toggleTodo = useHubTodosStore((s) => s.toggleTodo);
  const removeTodo = useHubTodosStore((s) => s.removeTodo);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [text, setText] = useState('');

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {todos.map((todo) => (
        <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
          <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? t.mutedText : t.text }}>
            {todo.text}
          </span>
          <button type="button" onClick={() => removeTodo(todo.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          placeholder="New to-do..."
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addTodo(text);
              setText('');
            }
          }}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            addTodo(text);
            setText('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
