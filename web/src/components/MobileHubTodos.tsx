import { useState } from 'react';
import { useHubTodosStore, TODO_STATUS_LABEL, TODO_PRIORITY_LABEL, TODO_REPEAT_LABEL, todayStr } from '../store/hubTodosStore';
import type { Subtask } from '../state/hubSubtasks';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { groupOpenTodosCore, sortCompletedTodosCore, formatShortDueDate } from '../state/hubTodoSections';
import { SwipeRow } from './SwipeRow';
import { BottomSheet } from './BottomSheet';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub. The To-Dos half of legacy's real
 * `hub.html` mobile page (legacy/hub.html:501-518), rebuilt around the same swipe-to-act rows
 * (`SwipeRow.tsx`: swipe right to complete, swipe left to delete, tap to open the detail sheet)
 * and a bottom-sheet task detail (`BottomSheet.tsx`) instead of `HubTodosPanel.tsx`'s own inline
 * "Details" toggle. Reuses every existing `hubTodosStore.ts` action -- no new business logic,
 * only a different UI shell, same "one store, two shells" pattern this project's desktop/mobile
 * split follows throughout.
 *
 * Deliberately scoped down from legacy's real task detail sheet (legacy/hub.html:292-334+): no
 * personalized greeting header, no search, no long-press-to-complete (the swipe gesture already
 * covers that action; legacy's own long-press exists as an alternative for exactly the devices/
 * users who find swiping hard, a real accessibility affordance this slice doesn't yet have a
 * home for). Chips/subtasks/due-date reuse the exact same store actions and labels
 * `HubTodosPanel.tsx`'s own desktop "Details" section already wires.
 */
export function MobileHubTodos() {
  const todos = useHubTodosStore((s) => s.todos);
  const addTodo = useHubTodosStore((s) => s.addTodo);
  const updateTodoText = useHubTodosStore((s) => s.updateTodoText);
  const toggleTodo = useHubTodosStore((s) => s.toggleTodo);
  const removeTodo = useHubTodosStore((s) => s.removeTodo);
  const cyclePriority = useHubTodosStore((s) => s.cyclePriority);
  const cycleStatus = useHubTodosStore((s) => s.cycleStatus);
  const cycleRepeat = useHubTodosStore((s) => s.cycleRepeat);
  const setDueDate = useHubTodosStore((s) => s.setDueDate);
  const addSubtask = useHubTodosStore((s) => s.addSubtask);
  const toggleSubtask = useHubTodosStore((s) => s.toggleSubtask);
  const removeSubtask = useHubTodosStore((s) => s.removeSubtask);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [text, setText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');

  const today = todayStr();
  const sections = groupOpenTodosCore(todos, today).filter((s) => s.tasks.length > 0);
  const completed = sortCompletedTodosCore(todos);
  const openTodo = openId ? todos.find((td) => td.id === openId) : null;

  return (
    <div style={{ padding: '0 12px 12px' }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 0' }}>
        <input
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addTodo(text);
              setText('');
            }
          }}
          placeholder="New to-do..."
          style={{ flex: 1, fontSize: 15, padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.border}`, background: t.editBg, color: t.text }}
        />
        <button
          type="button"
          onClick={() => {
            addTodo(text);
            setText('');
          }}
          style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: t.text, color: t.background, fontWeight: 600 }}
        >
          Add
        </button>
      </div>

      {sections.length === 0 && completed.length === 0 && (
        <div style={{ textAlign: 'center', color: t.mutedText, padding: '40px 0', fontSize: 13 }}>All clear. Tap + to add a task.</div>
      )}

      {sections.map((section) => (
        <div key={section.label} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, margin: '10px 4px 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {section.label}
          </div>
          {section.tasks.map((todo) => (
            <SwipeRow
              key={todo.id}
              id={todo.id}
              onTap={() => setOpenId(todo.id)}
              onSwipeRight={() => toggleTodo(todo.id)}
              onSwipeLeft={() => removeTodo(todo.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
                <span style={{ flex: 1, fontSize: 15, color: t.text }}>{todo.text}</span>
                {todo.dueDate && <span style={{ fontSize: 11, color: t.mutedText }}>{formatShortDueDate(todo.dueDate)}</span>}
                {todo.priority !== 'none' && <span style={{ fontSize: 10, fontWeight: 700, color: t.mutedText }}>{TODO_PRIORITY_LABEL[todo.priority]}</span>}
              </div>
            </SwipeRow>
          ))}
        </div>
      ))}

      {completed.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            style={{ fontSize: 12, fontWeight: 700, color: t.mutedText, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 4px' }}
          >
            {completedOpen ? '▾' : '▸'} Completed ({completed.length})
          </button>
          {completedOpen &&
            completed.map((todo) => (
              <SwipeRow key={todo.id} id={todo.id} onTap={() => setOpenId(todo.id)} onSwipeLeft={() => removeTodo(todo.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                  <span style={{ flex: 1, fontSize: 14, color: t.mutedText, textDecoration: 'line-through' }}>{todo.text}</span>
                </div>
              </SwipeRow>
            ))}
        </div>
      )}

      <BottomSheet open={!!openTodo} onClose={() => setOpenId(null)} title="Task">
        {openTodo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <textarea
              value={openTodo.text}
              onChange={(e) => updateTodoText(openTodo.id, e.currentTarget.value)}
              style={{ width: '100%', border: 'none', background: 'none', color: t.text, font: '650 19px Inter, sans-serif', resize: 'none' }}
              rows={2}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => cyclePriority(openTodo.id)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${t.border}`, background: t.toolbarButtonBg, color: t.text }}>
                {openTodo.priority === 'none' ? 'Priority' : TODO_PRIORITY_LABEL[openTodo.priority]}
              </button>
              <button type="button" onClick={() => cycleStatus(openTodo.id)} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${t.border}`, background: t.toolbarButtonBg, color: t.text }}>
                {openTodo.status === 'none' ? 'Status' : TODO_STATUS_LABEL[openTodo.status]}
              </button>
              <button
                type="button"
                onClick={() => cycleRepeat(openTodo.id)}
                disabled={((openTodo.subtasks as Subtask[]) || []).length > 0}
                style={{ fontSize: 12, padding: '8px 14px', borderRadius: 999, border: `1.5px solid ${t.border}`, background: t.toolbarButtonBg, color: t.text }}
              >
                {!openTodo.repeat ? 'Repeat' : TODO_REPEAT_LABEL[openTodo.repeat as string]}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="date" value={openTodo.dueDate || ''} onChange={(e) => setDueDate(openTodo.id, e.currentTarget.value || null)} style={{ fontSize: 13, padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.editBg, color: t.text }} />
              {openTodo.dueDate && (
                <button type="button" onClick={() => setDueDate(openTodo.id, null)} style={{ fontSize: 12, padding: '8px 12px', borderRadius: 10, border: 'none', background: t.toolbarButtonBg, color: t.mutedText }}>
                  Clear
                </button>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: t.hintText, margin: '4px 0 8px' }}>Subtasks</div>
              {((openTodo.subtasks as Subtask[]) || []).map((sub) => (
                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                  <input type="checkbox" checked={sub.done} onChange={() => toggleSubtask(openTodo.id, sub.id)} />
                  <span style={{ flex: 1, fontSize: 13, textDecoration: sub.done ? 'line-through' : 'none', color: sub.done ? t.mutedText : t.text }}>{sub.text}</span>
                  <button type="button" onClick={() => removeSubtask(openTodo.id, sub.id)} style={{ fontSize: 11, background: 'none', border: 'none', color: t.hintText }}>
                    remove
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  value={subtaskDraft}
                  onChange={(e) => setSubtaskDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addSubtask(openTodo.id, subtaskDraft);
                      setSubtaskDraft('');
                    }
                  }}
                  placeholder="Add subtask"
                  style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${t.border}`, background: t.editBg, color: t.text }}
                />
                <button
                  type="button"
                  onClick={() => {
                    addSubtask(openTodo.id, subtaskDraft);
                    setSubtaskDraft('');
                  }}
                  style={{ fontSize: 12, padding: '8px 12px', borderRadius: 10, border: 'none', background: t.toolbarButtonBg, color: t.text }}
                >
                  Add
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                removeTodo(openTodo.id);
                setOpenId(null);
              }}
              style={{ marginTop: 6, padding: 12, borderRadius: 12, border: `1.5px solid color-mix(in srgb, #c0392b 30%, ${t.border})`, background: 'none', color: '#c0392b', fontWeight: 600, fontSize: 13.5 }}
            >
              Delete task
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
