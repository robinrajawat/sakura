import { useState } from 'react';
import { useHubMeetingsStore } from '../store/hubMeetingsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/** Phase 4 slice (docs/framework-migration-plan.md): Hub Meeting Notes panel. Create/delete only. */
export function HubMeetingsPanel() {
  const meetings = useHubMeetingsStore((s) => s.meetings);
  const addMeeting = useHubMeetingsStore((s) => s.addMeeting);
  const removeMeeting = useHubMeetingsStore((s) => s.removeMeeting);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [attendees, setAttendees] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {meetings.map((m) => (
        <div key={m.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0' }}>
          <strong>{m.title}</strong>{' '}
          <span style={{ color: t.mutedText, fontSize: 11 }}>
            {m.date} {m.attendees && `· ${m.attendees}`}
          </span>
          <div>{m.notes}</div>
          <button type="button" onClick={() => removeMeeting(m.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            style={{ fontSize: 12, flex: 2 }}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            style={{ fontSize: 12 }}
          />
        </div>
        <input
          placeholder="Attendees"
          value={attendees}
          onChange={(e) => setAttendees(e.currentTarget.value)}
          style={{ fontSize: 12 }}
        />
        <textarea
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          rows={2}
          style={{ fontSize: 12, font: 'inherit' }}
        />
        <button
          type="button"
          onClick={() => {
            if (!title.trim()) return;
            addMeeting(title, date, attendees, notes);
            setTitle('');
            setDate('');
            setAttendees('');
            setNotes('');
          }}
        >
          Add meeting
        </button>
      </div>
    </div>
  );
}
