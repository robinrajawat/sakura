import type { ReactNode } from 'react';
import { useHubTodosStore } from '../store/hubTodosStore';
import { useHubJournalStore } from '../store/hubJournalStore';
import { useHubMeetingsStore } from '../store/hubMeetingsStore';
import { useHubLibraryStore } from '../store/hubLibraryStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Recap. Unlike the other four Hub
 * sections, Recap has no store of its own -- it's a read-only summary derived entirely from
 * the other four Hub stores already built (To-Dos, Journal, Meeting Notes, Library), same
 * "purely derived, no new state" shape as legacy's own Recap tab. Scoped down to simple counts
 * and a short "most recent N" list per section -- legacy's real Recap does more (streaks,
 * trends, cross-references into the outline itself via anchorNodeId), each a real,
 * separately-scoped follow-up once those richer data shapes exist to draw from.
 */
export function HubRecapPanel() {
  const todos = useHubTodosStore((s) => s.todos);
  const journalEntries = useHubJournalStore((s) => s.entries);
  const meetings = useHubMeetingsStore((s) => s.meetings);
  const libraryItems = useHubLibraryStore((s) => s.items);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const openTodos = todos.filter((td) => !td.done);
  const recentJournal = journalEntries.slice(-3).reverse();
  const recentMeetings = meetings.slice(-3).reverse();

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: t.text }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <Stat label="Open to-dos" value={openTodos.length} t={t} />
        <Stat label="Journal entries" value={journalEntries.length} t={t} />
        <Stat label="Meetings logged" value={meetings.length} t={t} />
        <Stat label="Library items" value={libraryItems.length} t={t} />
      </div>

      <RecapSection title="Open to-dos">
        {openTodos.length === 0 ? (
          <Empty t={t} />
        ) : (
          openTodos.slice(0, 5).map((td) => <div key={td.id}>• {td.text}</div>)
        )}
      </RecapSection>

      <RecapSection title="Recent journal entries">
        {recentJournal.length === 0 ? (
          <Empty t={t} />
        ) : (
          recentJournal.map((e) => (
            <div key={e.id}>
              • {e.date} {e.mood && `(${e.mood})`} — {e.body.slice(0, 60)}
            </div>
          ))
        )}
      </RecapSection>

      <RecapSection title="Recent meetings">
        {recentMeetings.length === 0 ? (
          <Empty t={t} />
        ) : (
          recentMeetings.map((m) => (
            <div key={m.id}>
              • {m.title} {m.date && `(${m.date})`}
            </div>
          ))
        )}
      </RecapSection>
    </div>
  );
}

type Tokens = (typeof THEME_TOKENS)['light'];

function Stat({ label, value, t }: { label: string; value: number; t: Tokens }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{value}</div>
      <div style={{ fontSize: 11, color: t.mutedText }}>{label}</div>
    </div>
  );
}

function RecapSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ t }: { t: Tokens }) {
  return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>Nothing here yet.</div>;
}
