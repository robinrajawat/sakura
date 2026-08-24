import { useEffect, useRef } from 'react';
import { useHubJournalStore, VALID_MOODS, todayString } from '../store/hubJournalStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { stripHtmlToText } from '../utils/stripHtmlToText';
import { SwipeRow } from './SwipeRow';
import { BottomSheet } from './BottomSheet';

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub. The Journal half of legacy's real
 * `hub.html` mobile page (legacy/hub.html:519-535) -- a "Today" card that always opens (or
 * creates) today's entry directly, then past entries as swipe-to-delete rows
 * (`SwipeRow.tsx`, delete-only -- unlike To-Dos, Journal has no complete action, matching
 * legacy's own per-list opt-in) opening the same `BottomSheet.tsx` detail view. Reuses every
 * existing `hubJournalStore.ts` action and the exact same rich-text editing approach
 * `HubJournalPanel.tsx`'s own desktop card already established (bullet/numbered-list toolbar +
 * Ctrl/Cmd+B/I, ref-based `contentEditable` with commit-on-blur) -- no new business logic or
 * editor behavior, only a different UI shell.
 */
export function MobileHubJournal() {
  const entries = useHubJournalStore((s) => s.entries);
  const expandedDate = useHubJournalStore((s) => s.expandedDate);
  const openEntry = useHubJournalStore((s) => s.openEntry);
  const closeEntry = useHubJournalStore((s) => s.closeEntry);
  const toggleMood = useHubJournalStore((s) => s.toggleMood);
  const setBody = useHubJournalStore((s) => s.setBody);
  const removeEntry = useHubJournalStore((s) => s.removeEntry);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const bodyEditorRef = useRef<HTMLDivElement>(null);

  const today = todayString();
  const todayEntry = entries.find((e) => e.date === today) ?? null;
  const pastEntries = [...entries].filter((e) => e.date !== today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const expandedEntry = expandedDate ? (entries.find((e) => e.date === expandedDate) ?? null) : null;

  useEffect(() => {
    if (!expandedDate || !bodyEditorRef.current) return;
    bodyEditorRef.current.innerHTML = sanitizeRichHtml(expandedEntry?.body || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedDate]);

  const commitBody = () => {
    if (!expandedDate || !bodyEditorRef.current) return;
    setBody(expandedDate, sanitizeRichHtml(bodyEditorRef.current.innerHTML));
  };

  return (
    <div style={{ padding: '10px 12px 12px' }}>
      <button
        type="button"
        onClick={() => openEntry(today)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '16px',
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: t.editBg,
          cursor: 'pointer',
          marginBottom: 14
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, textTransform: 'uppercase', letterSpacing: '.05em' }}>Today</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.text, margin: '2px 0 6px' }}>{formatDateLabel(today)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {todayEntry?.mood && <span style={{ fontSize: 11, color: t.mutedText }}>{todayEntry.mood}</span>}
          <span style={{ fontSize: 13, color: t.mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {todayEntry ? stripHtmlToText(todayEntry.body) || 'Tap to write...' : 'Tap to write...'}
          </span>
        </div>
      </button>

      {pastEntries.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.mutedText, margin: '10px 4px 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Past Entries
          </div>
          {pastEntries.map((entry) => (
            <SwipeRow key={entry.id} id={entry.date} onTap={() => openEntry(entry.date)} onSwipeLeft={() => removeEntry(entry.date)}>
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 12, color: t.mutedText }}>
                  {formatDateLabel(entry.date)} {entry.mood && `· ${entry.mood}`}
                </div>
                <div style={{ fontSize: 14, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stripHtmlToText(entry.body) || <span style={{ color: t.hintText }}>(empty)</span>}
                </div>
              </div>
            </SwipeRow>
          ))}
        </>
      )}

      {pastEntries.length === 0 && !todayEntry && (
        <div style={{ textAlign: 'center', color: t.mutedText, padding: '40px 0', fontSize: 13 }}>
          No past entries. Write today's entry above to get started.
        </div>
      )}

      <BottomSheet open={!!expandedDate} onClose={closeEntry} title={expandedDate ? formatDateLabel(expandedDate) : ''}>
        {expandedDate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {VALID_MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMood(expandedDate, m)}
                  style={{
                    fontSize: 12,
                    border: `1px solid ${expandedEntry?.mood === m ? t.text : t.border}`,
                    borderRadius: 999,
                    background: expandedEntry?.mood === m ? t.hoverBg : t.toolbarButtonBg,
                    color: t.text,
                    cursor: 'pointer',
                    padding: '6px 12px'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  bodyEditorRef.current?.focus();
                  document.execCommand('insertUnorderedList');
                }}
                style={{ border: `1px solid ${t.border}`, background: t.toolbarButtonBg, color: t.text, borderRadius: 8, width: 32, height: 32, fontSize: 14 }}
              >
                •
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  bodyEditorRef.current?.focus();
                  document.execCommand('insertOrderedList');
                }}
                style={{ border: `1px solid ${t.border}`, background: t.toolbarButtonBg, color: t.text, borderRadius: 8, width: 32, height: 32, fontSize: 14 }}
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
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
                  e.preventDefault();
                  document.execCommand('bold');
                } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
                  e.preventDefault();
                  document.execCommand('italic');
                }
              }}
              style={{ minHeight: 160, font: 'inherit', fontSize: 15, border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.editBg, color: t.text }}
            />

            <button
              type="button"
              onClick={() => {
                removeEntry(expandedDate);
              }}
              style={{ marginTop: 4, padding: 12, borderRadius: 12, border: `1.5px solid color-mix(in srgb, #c0392b 30%, ${t.border})`, background: 'none', color: '#c0392b', fontWeight: 600, fontSize: 13.5 }}
            >
              Delete entry
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
