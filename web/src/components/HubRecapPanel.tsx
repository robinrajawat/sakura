import { useEffect, useState, type ReactNode } from 'react';
import { useHubTodosStore } from '../store/hubTodosStore';
import { useHubJournalStore } from '../store/hubJournalStore';
import { useHubMeetingsStore } from '../store/hubMeetingsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { getRecapRange, collectRecapTodoItems, collectRecapMeetingItems, collectRecapJournalItems, type RecapPeriod } from '../state/hubRecap';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md): Hub Recap depth, replacing the Phase 4
 * placeholder (static counts + a "most recent N" list per Hub store) with legacy's real
 * Today/This Week/Last Week period model -- see `hubRecap.ts`'s own header for the full
 * scoping, including why outline-node/document-level activity, Decision Log/Diagrams/Q&A/Mind
 * Map items, the AI bullet-summary, and Library (never actually part of legacy's own Recap
 * scan) all stay out of this slice.
 *
 * Click-to-jump expands the matching row in its own Hub panel (`setFocusTodoId`/
 * `setFocusMeetingId`/`openEntry`, each rendered directly below Recap in `App.tsx`'s current
 * panel-dump layout) rather than legacy's own dock-panel-switch + scroll-to -- same "honest
 * first pass, simpler chrome" convention `HubTodosPanel.tsx`'s own due-reminder click-to-focus
 * already established, extended here to Meetings and reused as-is for Journal (which already
 * had `openEntry(date)`).
 */
export function HubRecapPanel() {
  const todos = useHubTodosStore((s) => s.todos);
  const setFocusTodoId = useHubTodosStore((s) => s.setFocusTodoId);
  const journalEntries = useHubJournalStore((s) => s.entries);
  const loadJournal = useHubJournalStore((s) => s.load);
  const journalLoaded = useHubJournalStore((s) => s.loaded);
  const openJournalEntry = useHubJournalStore((s) => s.openEntry);
  const meetings = useHubMeetingsStore((s) => s.meetings);
  const loadMeetings = useHubMeetingsStore((s) => s.loadMeetings);
  const setFocusMeetingId = useHubMeetingsStore((s) => s.setFocusMeetingId);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [period, setPeriod] = useState<RecapPeriod>('today');

  useEffect(() => {
    if (!journalLoaded) loadJournal();
    loadMeetings();
  }, [journalLoaded, loadJournal, loadMeetings]);

  const range = getRecapRange(period);
  const todoItems = collectRecapTodoItems(todos, range);
  const meetingItems = collectRecapMeetingItems(meetings, range);
  const journalItems = collectRecapJournalItems(journalEntries, range);
  const tasksCompleted = todoItems.filter((it) => it.kind === 'completed').length;
  const tasksCreated = todoItems.filter((it) => it.kind === 'created').length;

  const periods: { key: RecapPeriod; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'lastWeek', label: 'Last Week' }
  ];

  const nothingAtAll = todoItems.length === 0 && meetingItems.length === 0 && journalItems.length === 0;

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13, color: t.text }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            aria-pressed={period === p.key}
            style={{
              fontSize: 11,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              background: period === p.key ? t.hoverBg : t.toolbarButtonBg,
              color: t.text,
              cursor: 'pointer',
              padding: '4px 10px',
              fontWeight: period === p.key ? 600 : 400
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <Stat label="Tasks completed" value={tasksCompleted} t={t} />
        <Stat label="Tasks created" value={tasksCreated} t={t} />
        <Stat label="Meetings" value={meetingItems.length} t={t} />
        <Stat label="Journal entries" value={journalItems.length} t={t} />
      </div>

      {nothingAtAll && <Empty t={t} />}

      {todoItems.length > 0 && (
        <RecapSection title="To-Dos">
          {todoItems.slice(0, 6).map((it) => (
            <RecapRow key={it.id} t={t} onClick={() => setFocusTodoId(it.id)}>
              {it.kind === 'completed' ? '✓ ' : '+ '}
              {it.text}
            </RecapRow>
          ))}
          {todoItems.length > 6 && <More count={todoItems.length - 6} t={t} />}
        </RecapSection>
      )}

      {meetingItems.length > 0 && (
        <RecapSection title="Meeting Notes">
          {meetingItems.slice(0, 6).map((it) => (
            <RecapRow key={it.id} t={t} onClick={() => setFocusMeetingId(it.id)}>
              {it.kind === 'created' ? 'New: ' : 'Updated: '}
              {it.text}
            </RecapRow>
          ))}
          {meetingItems.length > 6 && <More count={meetingItems.length - 6} t={t} />}
        </RecapSection>
      )}

      {journalItems.length > 0 && (
        <RecapSection title="Journal">
          {journalItems.slice(0, 6).map((it) => (
            <RecapRow key={it.date} t={t} onClick={() => openJournalEntry(it.date)}>
              {it.date}
              {it.mood && ` · ${it.mood}`}
              {it.kind === 'updated' && ' (updated)'}
            </RecapRow>
          ))}
          {journalItems.length > 6 && <More count={journalItems.length - 6} t={t} />}
        </RecapSection>
      )}
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

function RecapRow({ children, onClick, t }: { children: ReactNode; onClick: () => void; t: Tokens }) {
  return (
    <div
      onClick={onClick}
      style={{ cursor: 'pointer', padding: '2px 0', color: t.text }}
      onMouseEnter={(e) => (e.currentTarget.style.color = t.mutedText)}
      onMouseLeave={(e) => (e.currentTarget.style.color = t.text)}
    >
      {children}
    </div>
  );
}

function More({ count, t }: { count: number; t: Tokens }) {
  return <div style={{ color: t.hintText, fontSize: 11, fontStyle: 'italic' }}>+{count} more</div>;
}

function Empty({ t }: { t: Tokens }) {
  return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>Nothing here yet.</div>;
}
