import { useEffect, useState } from 'react';
import { useHubTodosStore, TODO_STATUS_LABEL, TODO_PRIORITY_LABEL, TODO_REPEAT_LABEL, todayStr } from '../store/hubTodosStore';
import type { Subtask } from '../state/hubSubtasks';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import {
  groupOpenTodosCore,
  sortCompletedTodosCore,
  searchOpenTodosCore,
  daysOverdueLabel,
  formatShortDueDate,
  relativeCompletedLabel
} from '../state/hubTodoSections';

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
 *
 * §6.5 second slice: search filtering, urgency-sectioned grouping, the collapsible sorted
 * Completed section, and a due-date reminders toggle -- see `hubTodosStore.ts`'s own header for
 * the full scoping, including why "bulk actions" and "tags" (also named in this row of
 * docs/history/phase5-parity-checklist.md) are deliberately not built here.
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
  const searchQuery = useHubTodosStore((s) => s.searchQuery);
  const setSearchQuery = useHubTodosStore((s) => s.setSearchQuery);
  const completedOpen = useHubTodosStore((s) => s.completedOpen);
  const toggleCompletedOpen = useHubTodosStore((s) => s.toggleCompletedOpen);
  const remindersEnabled = useHubTodosStore((s) => s.remindersEnabled());
  const toggleReminders = useHubTodosStore((s) => s.toggleReminders);
  const checkDueReminders = useHubTodosStore((s) => s.checkDueReminders);
  const focusTodoId = useHubTodosStore((s) => s.focusTodoId);
  const clearFocusTodoId = useHubTodosStore((s) => s.clearFocusTodoId);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [text, setText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  // Matches legacy's real boot + standing-timer checks (legacy/hub.html:2725, 829) -- the
  // visibility-triggered re-check tied to a cloud-sync pull (legacy/hub.html:2735-2747) is
  // deliberately not ported, since no Hub cloud sync exists in web/ yet to trigger it from.
  useEffect(() => {
    checkDueReminders();
    const interval = setInterval(checkDueReminders, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todos]);

  // A clicked notification sets focusTodoId in the store; expand that row's Details section
  // here, the nearest equivalent this project has to legacy's own openTaskDetail() sheet.
  useEffect(() => {
    if (focusTodoId) {
      setExpandedId(focusTodoId);
      clearFocusTodoId();
    }
  }, [focusTodoId, clearFocusTodoId]);

  const today = todayStr();
  const isSearching = searchQuery.trim().length > 0;
  const searchResults = isSearching ? searchOpenTodosCore(todos, searchQuery.trim().toLowerCase()) : [];
  const sections = isSearching ? [] : groupOpenTodosCore(todos, today);
  const completed = sortCompletedTodosCore(todos);

  function renderRow(todo: (typeof todos)[number], meta: string) {
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
          {meta && <span style={{ fontSize: 11, color: t.mutedText }}>{meta}</span>}
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
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
        <input
          placeholder="Search open to-dos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          title={remindersEnabled ? 'Turn off due-date reminders' : 'Turn on due-date reminders'}
          onClick={() => {
            toggleReminders().then((msg) => setReminderStatus(msg));
          }}
          style={{ fontSize: 11 }}
        >
          {remindersEnabled ? 'Reminders: On' : 'Reminders: Off'}
        </button>
      </div>
      {reminderStatus && (
        <div style={{ fontSize: 11, color: t.mutedText, marginBottom: 6 }}>{reminderStatus}</div>
      )}

      {isSearching ? (
        searchResults.length ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, margin: '6px 0 2px' }}>Search Results</div>
            {searchResults.map((todo) => renderRow(todo, todo.dueDate ? formatShortDueDate(todo.dueDate) : ''))}
          </>
        ) : (
          <div style={{ fontSize: 12, color: t.mutedText, padding: '8px 0' }}>No matches. Try a different search.</div>
        )
      ) : (
        <>
          {sections.every((s) => s.tasks.length === 0) && (
            <div style={{ fontSize: 12, color: t.mutedText, padding: '8px 0' }}>All clear. Add a task below.</div>
          )}
          {sections
            .filter((s) => s.tasks.length > 0)
            .map((section) => (
              <div key={section.label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, margin: '6px 0 2px' }}>{section.label}</div>
                {section.tasks.map((todo) =>
                  renderRow(
                    todo,
                    section.label === 'Overdue'
                      ? daysOverdueLabel(todo.dueDate as string, today)
                      : section.label === 'Upcoming'
                        ? formatShortDueDate(todo.dueDate as string)
                        : ''
                  )
                )}
              </div>
            ))}
          {completed.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={toggleCompletedOpen}
                style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
              >
                {completedOpen ? '▾' : '▸'} Completed ({completed.length})
              </button>
              {completedOpen &&
                completed.map((todo) => (
                  <div key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `1px solid ${t.border}` }}>
                    <input type="checkbox" checked onChange={() => toggleTodo(todo.id)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ textDecoration: 'line-through', color: t.mutedText }}>{todo.text}</div>
                      {relativeCompletedLabel(todo.completedAt) && (
                        <div style={{ fontSize: 10, color: t.mutedText }}>{relativeCompletedLabel(todo.completedAt)}</div>
                      )}
                    </div>
                    <button type="button" onClick={() => removeTodo(todo.id)} style={{ fontSize: 11 }}>
                      remove
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
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
