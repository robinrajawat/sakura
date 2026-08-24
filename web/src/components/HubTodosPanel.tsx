import { useState } from 'react';
import { useHubTodosStore, TODO_STATUS_LABEL, TODO_PRIORITY_LABEL, TODO_REPEAT_LABEL } from '../store/hubTodosStore';
import type { Subtask } from '../state/hubSubtasks';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub To-Dos panel -- create/toggle/delete
 * only, originally.
 *
 * Phase 6.5 slice (docs/phase6-full-parity-plan.md §6.5), first piece: priority/status/due-
 * dates/repeat/subtasks, all wired to the newly-added `hubTodosStore.ts` actions (see that
 * file's own header for the full scoping). Each row gets a "Details" toggle revealing priority/
 * status/repeat cycle chips, a due-date input, and a subtasks list -- one row expanded at a
 * time, inline rather than legacy's own separate modal task-detail sheet (same "honest first
 * pass, simpler chrome" convention every other Pad/Hub slice in this project uses). Chip
 * cycling order matches legacy's own real cycles exactly (none→low→med→high for priority,
 * none→waiting→progress→blocked→review for status, none→daily→weekdays→weekly for repeat).
 *
 * A real crash caught by headless-browser testing before merge, not just the gauntlet: the
 * subtask-draft input's `onChange` read `e.currentTarget.value` INSIDE a `setSubtaskDrafts`
 * functional updater -- React 18 StrictMode double-invokes updater functions to check purity,
 * and by that second invocation the synthetic event's `currentTarget` is already gone, throwing
 * `Cannot read properties of null (reading 'value')` and unmounting the whole panel (no error
 * boundary above it). Fixed by capturing `value` synchronously in the handler body, outside the
 * updater closure -- the general lesson (never read a DOM/event reference from inside a
 * functional state updater, only plain values captured before it) applies to any future
 * `onChange` added to this file.
 */
export function HubTodosPanel() {
  const todos = useHubTodosStore((s) => s.todos);
  const addTodo = useHubTodosStore((s) => s.addTodo);
  const toggleTodo = useHubTodosStore((s) => s.toggleTodo);
  const removeTodo = useHubTodosStore((s) => s.removeTodo);
  const cyclePriority = useHubTodosStore((s) => s.cyclePriority);
  const cycleStatus = useHubTodosStore((s) => s.cycleStatus);
  const setDueDate = useHubTodosStore((s) => s.setDueDate);
  const cycleRepeat = useHubTodosStore((s) => s.cycleRepeat);
  const addSubtask = useHubTodosStore((s) => s.addSubtask);
  const toggleSubtask = useHubTodosStore((s) => s.toggleSubtask);
  const removeSubtask = useHubTodosStore((s) => s.removeSubtask);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [text, setText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {todos.map((todo) => {
        const subtasks = (todo.subtasks as Subtask[]) || [];
        const hasSubtasks = subtasks.length > 0;
        const expanded = expandedId === todo.id;
        return (
          <div key={todo.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
              <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? t.mutedText : t.text }}>
                {todo.text}
              </span>
              {todo.priority !== 'none' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: t.mutedText }}>{TODO_PRIORITY_LABEL[todo.priority]}</span>
              )}
              {todo.status !== 'none' && (
                <span style={{ fontSize: 10, fontWeight: 700, color: t.mutedText }}>{TODO_STATUS_LABEL[todo.status]}</span>
              )}
              {todo.dueDate && <span style={{ fontSize: 11, color: t.mutedText }}>{todo.dueDate}</span>}
              <button type="button" onClick={() => setExpandedId(expanded ? null : todo.id)} style={{ fontSize: 11 }}>
                {expanded ? 'Hide' : 'Details'}
              </button>
              <button type="button" onClick={() => removeTodo(todo.id)} style={{ fontSize: 11 }}>
                remove
              </button>
            </div>
            {expanded && (
              <div style={{ marginTop: 6, marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={() => cyclePriority(todo.id)} style={{ fontSize: 11 }}>
                    {todo.priority === 'none' ? 'Priority' : TODO_PRIORITY_LABEL[todo.priority]}
                  </button>
                  <button type="button" onClick={() => cycleStatus(todo.id)} style={{ fontSize: 11 }}>
                    {todo.status === 'none' ? 'Status' : TODO_STATUS_LABEL[todo.status]}
                  </button>
                  <button
                    type="button"
                    onClick={() => cycleRepeat(todo.id)}
                    disabled={hasSubtasks}
                    title={hasSubtasks ? 'Repeat is off while this task has subtasks' : undefined}
                    style={{ fontSize: 11 }}
                  >
                    {!todo.repeat ? 'Repeat' : TODO_REPEAT_LABEL[todo.repeat as string]}
                  </button>
                  <input
                    type="date"
                    value={todo.dueDate || ''}
                    onChange={(e) => setDueDate(todo.id, e.currentTarget.value || null)}
                    style={{ fontSize: 11 }}
                  />
                  {todo.dueDate && (
                    <button type="button" onClick={() => setDueDate(todo.id, null)} style={{ fontSize: 11 }}>
                      Clear
                    </button>
                  )}
                </div>
                {subtasks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {subtasks.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={s.done} onChange={() => toggleSubtask(todo.id, s.id)} />
                        <span style={{ flex: 1, fontSize: 12, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? t.mutedText : t.text }}>
                          {s.text}
                        </span>
                        <button type="button" onClick={() => removeSubtask(todo.id, s.id)} style={{ fontSize: 11 }}>
                          remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    placeholder="Add subtask"
                    maxLength={300}
                    value={subtaskDrafts[todo.id] || ''}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      setSubtaskDrafts((d) => ({ ...d, [todo.id]: value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addSubtask(todo.id, subtaskDrafts[todo.id] || '');
                        setSubtaskDrafts((d) => ({ ...d, [todo.id]: '' }));
                      }
                    }}
                    style={{ fontSize: 12, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      addSubtask(todo.id, subtaskDrafts[todo.id] || '');
                      setSubtaskDrafts((d) => ({ ...d, [todo.id]: '' }));
                    }}
                    style={{ fontSize: 11 }}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
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
