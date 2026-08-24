import { useEffect, useState } from 'react';
import { useHubMeetingsStore } from '../store/hubMeetingsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Meeting Notes panel -- create/delete
 * only, in-memory, originally.
 *
 * §6.5 slice (docs/phase6-full-parity-plan.md): real persistence (loaded once on mount, same
 * pattern `HubJournalPanel.tsx` uses), attendees/time/agenda/notes fields, action items with
 * Promote-to-To-Do -- see `hubMeetingsStore.ts`/`state/hubMeetings.ts`'s own headers for the
 * full scoping, including why "New from template" only ever creates a blank note (legacy ships
 * no real template content to select from) and why links/rich-text/AI-rewrite stay out of
 * scope. One meeting expanded at a time, inline rather than legacy's own floating panel chrome,
 * same "honest first pass, simpler chrome" convention every other Pad/Hub slice uses.
 */
export function HubMeetingsPanel() {
  const meetings = useHubMeetingsStore((s) => s.meetings);
  const loaded = useHubMeetingsStore((s) => s.loaded);
  const loadMeetings = useHubMeetingsStore((s) => s.loadMeetings);
  const createMeeting = useHubMeetingsStore((s) => s.createMeeting);
  const deleteMeeting = useHubMeetingsStore((s) => s.deleteMeeting);
  const updateMeetingField = useHubMeetingsStore((s) => s.updateMeetingField);
  const addAttendee = useHubMeetingsStore((s) => s.addAttendee);
  const removeAttendee = useHubMeetingsStore((s) => s.removeAttendee);
  const addActionItem = useHubMeetingsStore((s) => s.addActionItem);
  const toggleActionItem = useHubMeetingsStore((s) => s.toggleActionItem);
  const updateActionItemText = useHubMeetingsStore((s) => s.updateActionItemText);
  const removeActionItem = useHubMeetingsStore((s) => s.removeActionItem);
  const promoteActionItem = useHubMeetingsStore((s) => s.promoteActionItem);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attendeeDraft, setAttendeeDraft] = useState('');
  const [actionDraft, setActionDraft] = useState('');

  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  if (!loaded) {
    return <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: t.mutedText }}>Loading…</div>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {meetings.length === 0 && (
        <div style={{ fontSize: 12, color: t.mutedText, padding: '8px 0' }}>No meeting notes yet.</div>
      )}
      {meetings.map((m) => {
        const expanded = expandedId === m.id;
        return (
          <div key={m.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '6px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong style={{ flex: 1 }}>{m.title || 'Untitled meeting'}</strong>
              <span style={{ color: t.mutedText, fontSize: 11 }}>
                {m.date}
                {m.time ? ` · ${m.time}` : ''}
              </span>
              <button type="button" onClick={() => setExpandedId(expanded ? null : m.id)} style={{ fontSize: 11 }}>
                {expanded ? 'Hide' : 'Details'}
              </button>
              <button type="button" onClick={() => deleteMeeting(m.id)} style={{ fontSize: 11 }}>
                remove
              </button>
            </div>
            {m.attendees.length > 0 && (
              <div style={{ fontSize: 11, color: t.mutedText, marginTop: 2 }}>{m.attendees.join(', ')}</div>
            )}

            {expanded && (
              <div style={{ marginTop: 8, marginLeft: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    placeholder="Title"
                    value={m.title}
                    onChange={(e) => updateMeetingField(m.id, { title: e.currentTarget.value })}
                    style={{ fontSize: 12, flex: 2 }}
                  />
                  <input
                    type="date"
                    value={m.date}
                    onChange={(e) => updateMeetingField(m.id, { date: e.currentTarget.value })}
                    style={{ fontSize: 12 }}
                  />
                  <input
                    type="time"
                    value={m.time}
                    onChange={(e) => updateMeetingField(m.id, { time: e.currentTarget.value })}
                    style={{ fontSize: 12 }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                    {m.attendees.map((a) => (
                      <span
                        key={a}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, border: `1px solid ${t.border}`, borderRadius: 4, padding: '1px 4px' }}
                      >
                        {a}
                        <button type="button" onClick={() => removeAttendee(m.id, a)} style={{ fontSize: 10 }}>
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    placeholder="Add attendee"
                    value={attendeeDraft}
                    onChange={(e) => setAttendeeDraft(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addAttendee(m.id, attendeeDraft);
                        setAttendeeDraft('');
                      }
                    }}
                    style={{ fontSize: 12 }}
                  />
                </div>

                <textarea
                  placeholder="Agenda"
                  value={m.agenda}
                  onChange={(e) => updateMeetingField(m.id, { agenda: e.currentTarget.value })}
                  rows={2}
                  style={{ fontSize: 12, font: 'inherit' }}
                />
                <textarea
                  placeholder="Notes"
                  value={m.body}
                  onChange={(e) => updateMeetingField(m.id, { body: e.currentTarget.value })}
                  rows={2}
                  style={{ fontSize: 12, font: 'inherit' }}
                />

                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, marginBottom: 4 }}>Action Items</div>
                  {m.actionItems.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                      <input type="checkbox" checked={item.done} onChange={() => toggleActionItem(m.id, item.id)} />
                      <input
                        value={item.text}
                        onChange={(e) => updateActionItemText(m.id, item.id, e.currentTarget.value)}
                        style={{
                          flex: 1,
                          fontSize: 12,
                          textDecoration: item.done ? 'line-through' : 'none',
                          color: item.done ? t.mutedText : t.text
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => promoteActionItem(m.id, item.id)}
                        disabled={!!item.promotedTodoId}
                        title={item.promotedTodoId ? 'Already added to To-Dos' : 'Add this as a real To-Do'}
                        style={{ fontSize: 11 }}
                      >
                        {item.promotedTodoId ? 'Added ✓' : 'Promote'}
                      </button>
                      <button type="button" onClick={() => removeActionItem(m.id, item.id)} style={{ fontSize: 11 }}>
                        remove
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input
                      placeholder="Add action item"
                      value={actionDraft}
                      onChange={(e) => setActionDraft(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addActionItem(m.id, actionDraft);
                          setActionDraft('');
                        }
                      }}
                      style={{ fontSize: 12, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addActionItem(m.id, actionDraft);
                        setActionDraft('');
                      }}
                      style={{ fontSize: 11 }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => createMeeting()} style={{ marginTop: 8 }}>
        New meeting note
      </button>
    </div>
  );
}
