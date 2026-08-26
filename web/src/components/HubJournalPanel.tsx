import { useEffect, useRef, useState } from 'react';
import { useHubJournalStore, VALID_MOODS, formatDateLocal, todayString } from '../store/hubJournalStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { stripHtmlToText } from '../utils/stripHtmlToText';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import type { JournalEntry } from '../state/hubJournal';
import { CalendarIcon } from '../icons';

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function formatDateLabel(date: string): string {
  // yyyy-mm-dd parsed as local calendar fields, not via `new Date(date)` (which reads it as UTC
  // midnight and can render the wrong day near a timezone boundary).
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  return date === todayString() ? `Today · ${label}` : label;
}

type Theme = (typeof THEME_TOKENS)[keyof typeof THEME_TOKENS];

/** Custom month-grid date picker, direct-in-spirit port of legacy's `#journal-date-popover`
 * (index.html:49850-49898): Today/Yesterday/Tomorrow presets, prev/next month nav, a dot marking
 * days that already have an entry. Deliberately simpler than legacy in one respect: no
 * viewport-edge flipping (always anchors below-left of its trigger, growing rightward into the
 * content pane rather than leftward toward the sidebar) -- this project's other dropdowns
 * (DocumentTabs.tsx's tab overview) don't do edge-flipping either, so this stays consistent with
 * that convention rather than being a special case. */
function JournalCalendarPopover({
  entries,
  onSelect,
  t
}: {
  entries: JournalEntry[];
  onSelect: (date: string) => void;
  t: Theme;
}) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const entryDates = new Set(entries.map((e) => e.date));
  const today = todayString();
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const presets: { label: string; date: string }[] = [
    { label: 'Yesterday', date: formatDateLocal(addDays(now, -1)) },
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: formatDateLocal(addDays(now, 1)) }
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        zIndex: 20,
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,.18)',
        padding: 10,
        width: 220,
        fontSize: 12
      }}
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onSelect(p.date)}
            style={{
              flex: 1,
              fontSize: 11,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              background: t.toolbarButtonBg,
              color: t.text,
              cursor: 'pointer',
              padding: '3px 0'
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          style={{ border: 'none', background: 'none', color: t.text, cursor: 'pointer', fontSize: 13 }}
        >
          ‹
        </button>
        <span style={{ fontWeight: 600 }}>{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          style={{ border: 'none', background: 'none', color: t.text, cursor: 'pointer', fontSize: 13 }}
        >
          ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => (
          <div key={i} style={{ color: t.hintText, fontSize: 10 }}>
            {label}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const dateStr = formatDateLocal(new Date(viewYear, viewMonth, day));
          const isToday = dateStr === today;
          const hasEntry = entryDates.has(dateStr);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(dateStr)}
              style={{
                position: 'relative',
                border: isToday ? `1px solid ${t.text}` : '1px solid transparent',
                borderRadius: 4,
                background: 'transparent',
                color: t.text,
                cursor: 'pointer',
                padding: '3px 0',
                fontSize: 11
              }}
            >
              {day}
              {hasEntry && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 1,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: t.text
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Phase 6.5 slice (docs/phase6-full-parity-plan.md): Hub Journal depth. Replaces the Phase 4
 * placeholder (freeform create/delete, plain textarea) with legacy's real one-entry-per-date
 * model: a list of existing entries, each opening a single-entry "card" (index.html's own
 * `#journal-card`/`showJournalCardView`) to edit mood/body, plus a calendar popover to jump to
 * or create any date's entry.
 *
 * Rich text matches legacy's actual (narrower-than-Note-panel) toolset exactly: bullet/numbered
 * list toolbar buttons plus Ctrl/Cmd+B/I keyboard-shortcut-only bold/italic (index.html:33771
 * area, 49215-49219) -- no underline/strike/link/image/table, which legacy's own Journal editor
 * genuinely doesn't have either (contrast NotePanel.tsx's fuller toolbar). Body content is
 * imperative via a ref + commit-on-blur, same reasoning as NotePanel.tsx's own note editor
 * (`contentEditable` fights React state on every keystroke) -- a deliberate deviation from
 * legacy's own commit-on-every-keystroke `input` handler, not an oversight.
 *
 * Delete uses `window.confirm` rather than a new modal-confirm component, matching this
 * project's "simpler chrome first pass" convention (no shared confirm-dialog component exists
 * anywhere in web/ yet to reuse).
 *
 * Deliberately still out of scope: tags UI (legacy itself has no tags UI for Journal despite
 * README.md:99 referencing "free-form tags" and the data model supporting them -- a pre-existing
 * doc/code mismatch, not a gap this slice invents new capability to close) and search (legacy's
 * own Journal search lives only in the shared Quick Assist / hub-wide search bar, neither of
 * which exists in web/ yet -- a real, separately-scoped follow-up).
 */
export function HubJournalPanel() {
  const entries = useHubJournalStore((s) => s.entries);
  const loaded = useHubJournalStore((s) => s.loaded);
  const expandedDate = useHubJournalStore((s) => s.expandedDate);
  const load = useHubJournalStore((s) => s.load);
  const openEntry = useHubJournalStore((s) => s.openEntry);
  const closeEntry = useHubJournalStore((s) => s.closeEntry);
  const toggleMood = useHubJournalStore((s) => s.toggleMood);
  const setBody = useHubJournalStore((s) => s.setBody);
  const removeEntry = useHubJournalStore((s) => s.removeEntry);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarWrapRef = useRef<HTMLDivElement>(null);
  const bodyEditorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (!calendarOpen) return;
    function onClickOutside(e: MouseEvent): void {
      if (calendarWrapRef.current && !calendarWrapRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [calendarOpen]);

  const expandedEntry = expandedDate ? entries.find((e) => e.date === expandedDate) ?? null : null;

  // Imperatively (re)sync the contenteditable's content whenever the open date changes -- NOT
  // React-controlled, same reasoning as NotePanel.tsx's own note editor.
  useEffect(() => {
    if (!expandedDate || !bodyEditorRef.current) return;
    bodyEditorRef.current.innerHTML = sanitizeRichHtml(expandedEntry?.body || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDate]);

  const commitBody = () => {
    if (!expandedDate || !bodyEditorRef.current) return;
    setBody(expandedDate, sanitizeRichHtml(bodyEditorRef.current.innerHTML));
  };

  const sortedEntries = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (expandedDate) {
    return (
      <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={closeEntry}
            style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', fontSize: 12 }}
          >
            ← Back
          </button>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 12 }}>{formatDateLabel(expandedDate)}</div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete the journal entry for ${formatDateLabel(expandedDate)}? This can't be undone.`)) {
                removeEntry(expandedDate);
              }
            }}
            style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', fontSize: 11 }}
          >
            Delete
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {VALID_MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMood(expandedDate, m)}
              style={{
                fontSize: 11,
                border: `1px solid ${expandedEntry?.mood === m ? t.text : t.border}`,
                borderRadius: 4,
                background: expandedEntry?.mood === m ? t.hoverBg : t.toolbarButtonBg,
                color: t.text,
                cursor: 'pointer',
                padding: '3px 8px'
              }}
            >
              {m}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 6, borderBottom: `1px solid ${t.border}`, paddingBottom: 6 }}>
          <button
            type="button"
            title="Bullet list"
            onMouseDown={(e) => {
              e.preventDefault();
              bodyEditorRef.current?.focus();
              document.execCommand('insertUnorderedList');
            }}
            style={{
              border: `1px solid ${t.border}`,
              background: t.toolbarButtonBg,
              color: t.text,
              borderRadius: 4,
              minWidth: 24,
              height: 24,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            •
          </button>
          <button
            type="button"
            title="Numbered list"
            onMouseDown={(e) => {
              e.preventDefault();
              bodyEditorRef.current?.focus();
              document.execCommand('insertOrderedList');
            }}
            style={{
              border: `1px solid ${t.border}`,
              background: t.toolbarButtonBg,
              color: t.text,
              borderRadius: 4,
              minWidth: 24,
              height: 24,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            1.
          </button>
        </div>

        <div
          ref={bodyEditorRef}
          contentEditable
          suppressContentEditableWarning
          onBlur={commitBody}
          onKeyDown={(e) => {
            // Keyboard-shortcut-only bold/italic, matching legacy exactly (no visible buttons
            // for these two, index.html:49215-49219).
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              document.execCommand('bold');
            } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
              e.preventDefault();
              document.execCommand('italic');
            }
          }}
          style={{
            minHeight: 140,
            font: 'inherit',
            fontSize: 13,
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            padding: 8,
            background: t.editBg,
            color: t.text,
            boxSizing: 'border-box'
          }}
        />
        {expandedEntry?.modifiedAt && (
          <div style={{ color: t.hintText, fontSize: 10, marginTop: 6 }}>
            Last updated {formatRelativeTime(expandedEntry.modifiedAt)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => openEntry(todayString())}
          style={{
            fontSize: 11,
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            background: t.toolbarButtonBg,
            color: t.text,
            cursor: 'pointer',
            padding: '4px 10px'
          }}
        >
          Today
        </button>
        <div ref={calendarWrapRef} style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            style={{
              fontSize: 11,
              border: `1px solid ${t.border}`,
              borderRadius: 4,
              background: t.toolbarButtonBg,
              color: t.text,
              cursor: 'pointer',
              padding: '4px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <CalendarIcon width={12} height={12} /> Jump to date
          </button>
          {calendarOpen && (
            <JournalCalendarPopover
              entries={entries}
              t={t}
              onSelect={(date) => {
                openEntry(date);
                setCalendarOpen(false);
              }}
            />
          )}
        </div>
      </div>

      {sortedEntries.length === 0 && <div style={{ color: t.hintText, fontSize: 12 }}>No journal entries yet.</div>}

      {sortedEntries.map((entry) => (
        <div
          key={entry.id}
          onClick={() => openEntry(entry.date)}
          style={{ borderBottom: `1px solid ${t.border}`, padding: '6px 2px', cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <div style={{ color: t.hintText, fontSize: 11 }}>
            {formatDateLabel(entry.date)} {entry.mood && `· ${entry.mood}`}
          </div>
          <div style={{ color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stripHtmlToText(entry.body) || <span style={{ color: t.hintText }}>(empty)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
