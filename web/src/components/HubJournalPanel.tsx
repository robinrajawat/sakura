import { useEffect, useState } from 'react';
import { useHubJournalStore, VALID_MOODS } from '../store/hubJournalStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Journal panel. Create/delete only --
 * editing an existing entry is deferred, a real, separately-scoped follow-up.
 */
export function HubJournalPanel() {
  const entries = useHubJournalStore((s) => s.entries);
  const loaded = useHubJournalStore((s) => s.loaded);
  const load = useHubJournalStore((s) => s.load);
  const addEntry = useHubJournalStore((s) => s.addEntry);
  const removeEntry = useHubJournalStore((s) => s.removeEntry);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [body, setBody] = useState('');
  const [mood, setMood] = useState('');

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {entries.map((entry) => (
        <div key={entry.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0' }}>
          <div style={{ color: t.mutedText, fontSize: 11 }}>
            {entry.date} {entry.mood && `· ${entry.mood}`}
          </div>
          <div>{entry.body}</div>
          <button type="button" onClick={() => removeEntry(entry.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <select value={mood} onChange={(e) => setMood(e.currentTarget.value)} style={{ fontSize: 12 }}>
          <option value="">Mood...</option>
          {VALID_MOODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          placeholder="What's on your mind..."
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            if (!body.trim()) return;
            addEntry(body, mood, []);
            setBody('');
            setMood('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
