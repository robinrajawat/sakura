import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useThemeStore, THEME_TOKENS, type ThemeTokens } from '../store/themeStore';
import { useOutlineStore } from '../store/outlineStore';
import { useOutlinePrefsStore } from '../store/outlinePrefsStore';
import { useQuickAssistStore } from '../store/quickAssistStore';
import { buildQaActionsWithRestructureDialog, buildQaEntries, navigableQaEntries, qaExecuteCommand, qaVerbLabel, type QaEntry } from '../state/quickAssist';

/**
 * §6.10 slice 3 (docs/phase6-full-parity-plan.md): the Quick Assist command box itself. Direct
 * port of legacy's real `#qa-input`/`#qa-dropdown`/`#qa-results` (legacy/index.html:6769-6786)
 * and their keydown/render wiring (`qaRender`, `qaMoveSelection`, `qaActivateSelection`,
 * `setQaOpen`, legacy/index.html:17342-17786) for the command-only subset `state/quickAssist.ts`
 * builds -- see that file's own header for exactly which of legacy's real ids this covers and why.
 *
 * Deliberately smaller than legacy's real box: no category-prefix scoping, no chip-mode category
 * picker, no fuzzy matching, no search-hit rows (Documents/Notes/Tags/Settings/Help) -- that's
 * legacy's real Global Search half of Quick Assist, scoped separately as §6.10 slice 4. No
 * render-debounce either: legacy's own `QA_RENDER_DEBOUNCE_MS` exists because `collectSearchGroups`
 * rescans every open document's full content on every keystroke; this slice's matching is a
 * synchronous filter over ~20 fixed entries, cheap enough to run on every keystroke directly.
 *
 * Also new here: a small Undo-toast, since legacy's real `showActionToast` (an "Undo" chip after
 * every command/action) has no existing equivalent anywhere in `web/` yet (this project's
 * established convention elsewhere is `window.alert`/`window.confirm` for one-off messages -- see
 * e.g. `App.tsx`'s own header note on `handleAiRewrite`). Built small and scoped to just this
 * component rather than a generic app-wide toast system, since Quick Assist's whole "safe to try
 * things" pitch depends on Undo being visibly one click away, matching legacy's own real UX.
 */
const HINT_PHRASES = ['hide file explorer', 'toggle dark mode', 'duplicate node', 'rewrite this node', 'toggle compact rows', 'generate outline'];

export function QuickAssistBar({ openRestructureDialog }: { openRestructureDialog: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const open = useQuickAssistStore((s) => s.open);
  const closeBox = useQuickAssistStore((s) => s.closeBox);
  const toggleBox = useQuickAssistStore((s) => s.toggleBox);
  const quickAssistEnabled = useOutlinePrefsStore((s) => s.quickAssistEnabled);
  const hasSelection = useOutlineStore((s) => s.selectedId !== null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Matches legacy's real `setQaOpen(true)` (focuses the input on a short delay) and
  // `setQaOpen(false)` (clears the input value) -- both folded into one effect here since React
  // owns `query` rather than the DOM owning it directly.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const actions = buildQaActionsWithRestructureDialog(openRestructureDialog);
  const entries: QaEntry[] = buildQaEntries(query, hasSelection, actions);
  const navEntries = navigableQaEntries(entries);

  function showToast(message: string, undo?: () => void): void {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, undo });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  function activate(entry: QaEntry): void {
    if (entry.kind === 'command') {
      const result = qaExecuteCommand(entry.cmd, entry.verb);
      showToast(result.message, result.undo);
    } else {
      const action = entry.action;
      void action.run().then((result) => {
        if (result.handledElsewhere) return;
        if (result.ok) {
          showToast(`Done: ${action.label}`, action.supportsUndo ? () => useOutlineStore.getState().undo() : undefined);
        } else {
          // Deliberately shows the action's own real failure reason (e.g. "No AI provider key
          // configured...") instead of legacy's generic "<label> cancelled" -- every other AI
          // entry point in web/ already surfaces its real error message (see App.tsx's own
          // window.alert(result.message) convention), and swallowing it here would be a real
          // loss for e.g. a first-run "no API key" case.
          showToast(result.message || `${action.label} cancelled`);
        }
      });
    }
    closeBox();
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeBox();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navEntries.length) setActiveIndex((i) => (i + 1) % navEntries.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navEntries.length) setActiveIndex((i) => (i - 1 + navEntries.length) % navEntries.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const entry = navEntries[activeIndex];
      if (entry) activate(entry);
    }
  }

  if (!quickAssistEnabled) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={toggleBox} title="Quick Assist (Ctrl/Cmd+K)" aria-pressed={open} aria-label="Quick Assist">
        ⌘K
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Quick Assist"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 130,
            width: 340,
            maxWidth: '92vw',
            background: t.background,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            boxShadow: '0 14px 28px rgba(0,0,0,.12)',
            padding: 10,
            fontFamily: 'sans-serif',
            color: t.text
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search…"
            autoComplete="off"
            aria-label="Quick assist command and search input"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              font: 'inherit',
              fontSize: 12,
              padding: '6px 8px',
              borderRadius: 6,
              border: `1px solid ${t.border}`,
              background: t.background,
              color: t.text
            }}
          />
          <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
            {!query.trim() && (
              <div style={{ fontSize: 11, color: t.mutedText }}>
                <div style={{ marginBottom: 6 }}>Try things like</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {HINT_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => {
                        setQuery(phrase);
                        setActiveIndex(0);
                        inputRef.current?.focus();
                      }}
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: `1px solid ${t.border}`,
                        background: 'transparent',
                        color: t.text,
                        cursor: 'pointer'
                      }}
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!!query.trim() && entries.length === 0 && (
              <div style={{ fontSize: 12, color: t.mutedText, padding: '8px 4px' }}>No matching command for &quot;{query.trim()}&quot;</div>
            )}
            {entries.map((entry) => {
              if (entry.kind === 'command') {
                const navIndex = navEntries.indexOf(entry);
                const verbLabel = qaVerbLabel(entry.verb, entry.cmd);
                return (
                  <button
                    key={`cmd-${entry.cmd.id}`}
                    type="button"
                    onClick={() => activate(entry)}
                    onMouseEnter={() => setActiveIndex(navIndex)}
                    style={qaRowStyle(t, navIndex === activeIndex)}
                  >
                    <span style={{ fontWeight: 600, color: verbLabel === 'Hide' ? t.mutedText : 'var(--accent)' }}>{verbLabel}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.cmd.label}</span>
                    <span style={{ fontSize: 10, color: t.mutedText }}>{entry.cmd.get() ? 'currently on' : 'currently off'}</span>
                  </button>
                );
              }
              const navIndex = entry.disabled ? -1 : navEntries.indexOf(entry);
              return (
                <button
                  key={`action-${entry.action.id}`}
                  type="button"
                  disabled={entry.disabled}
                  onClick={() => activate(entry)}
                  onMouseEnter={() => {
                    if (!entry.disabled) setActiveIndex(navIndex);
                  }}
                  style={qaRowStyle(t, navIndex >= 0 && navIndex === activeIndex, entry.disabled)}
                >
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Run</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.action.label}</span>
                  {entry.disabled && <span style={{ fontSize: 10, color: t.mutedText }}>select a node first</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 140,
            background: t.background,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,.15)',
            padding: '8px 10px',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            maxWidth: 360
          }}
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function qaRowStyle(t: ThemeTokens, active: boolean, disabled?: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    font: 'inherit',
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 6,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    background: active ? t.hoverBg : 'transparent',
    color: disabled ? t.mutedText : t.text,
    opacity: disabled ? 0.6 : 1
  };
}
