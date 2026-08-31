import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useOutlineStore } from '../store/outlineStore';
import { useOutlinePrefsStore } from '../store/outlinePrefsStore';
import { useQuickAssistStore } from '../store/quickAssistStore';
import {
  buildQaActionsWithRestructureDialog,
  buildQaEntries,
  buildQaPickerEntries,
  navigableQaEntries,
  qaExecuteCommand,
  qaPickerInsertText,
  qaVerbLabel,
  type QaEntry,
  type QaPickerVerb
} from '../state/quickAssist';
import { QaCategoryIcon } from '../icons';

const QA_PICKER_VERB_LABELS: Record<QaPickerVerb, string> = { show: 'Show', hide: 'Hide', toggle: 'Toggle', run: 'Run' };

/**
 * §6.10 slice 3 (docs/phase6-full-parity-plan.md): the Quick Assist command box itself. Direct
 * port of legacy's real `#qa-input`/`#qa-dropdown`/`#qa-results` (legacy/index.html:6769-6786)
 * and their keydown/render wiring (`qaRender`, `qaMoveSelection`, `qaActivateSelection`,
 * `setQaOpen`, legacy/index.html:17342-17786) for the command-only subset `state/quickAssist.ts`
 * builds -- see that file's own header for exactly which of legacy's real ids this covers and why.
 *
 * Deliberately smaller than legacy's real box: no fuzzy matching -- see `state/quickAssistSearch.ts`'s
 * own header for the search-hit rows this slice does add (§6.10 slice 4) and which of legacy's
 * real 18 search categories they cover. No render-debounce either: legacy's own
 * `QA_RENDER_DEBOUNCE_MS` exists because its real `collectSearchGroups` has no per-category or
 * per-document result cap until AFTER the full scan; this port's own collectors early-exit as
 * soon as each category's own small cap (4-6 items) is hit, so even the search-hit path stays
 * cheap enough to run synchronously on every keystroke.
 *
 * §6.10 slice 4b: added category-prefix scoping ("notes: budget" scopes to just the Notes
 * category) and the chip-mode category picker (the "⋯" button, or Space on an empty input) --
 * both direct ports of legacy's real mechanism, see `state/quickAssistSearch.ts`'s own header for
 * the details and `state/quickAssist.ts`'s `buildQaPickerEntries`/`qaPickerInsertText` for the
 * picker's own logic. `pickerOpen` swaps this component's rendered list for the picker's two chip
 * rows (verb chips, category chips) instead of the normal command/action/search-hit list; picking
 * either chip inserts its prefix into the input and returns to normal rendering, matching
 * legacy's real "stepping stone" behavior (the box stays open, nothing executes).
 *
 * Also new here: a small Undo-toast, since legacy's real `showActionToast` (an "Undo" chip after
 * every command/action) has no existing equivalent anywhere in `web/` yet (this project's
 * established convention elsewhere is `window.alert`/`window.confirm` for one-off messages -- see
 * e.g. `App.tsx`'s own header note on `handleAiRewrite`). Built small and scoped to just this
 * component rather than a generic app-wide toast system, since Quick Assist's whole "safe to try
 * things" pitch depends on Undo being visibly one click away, matching legacy's own real UX.
 *
 * §8.4m retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `.qa-input-row`/`.qa-icon-btn`/`.qa-dropdown`/`.qa-hint`/`.qa-results`/`.qa-item`/`.qa-chip-row`/
 * `.gs-group-title` classes (index.css, cited from legacy/index.html:1117-1177) instead of inline
 * `style` objects.
 *
 * Restructured (docs/phase8-design-system-parity-plan.md's 8.4m follow-up) to match legacy's own
 * real structure, not just its CSS: legacy's Quick Assist input is a PERMANENTLY-VISIBLE
 * search-style box docked in the app bar by default (`qaLocation='appbar'`, legacy/index.html:185;
 * `#appbar-qa-slot`, the FIRST child of `#header-actions`, legacy/index.html:4533-4534) -- there is
 * no click-to-reveal toggle button in legacy at all. `.qa-input-row` (icon button + input) now
 * renders unconditionally; `.qa-dropdown` opens below-left of it, driven by
 * focus/typing/outside-click/Escape/⌘K exactly matching legacy's own real `setQaOpen`/`toggleQa`
 * (legacy/index.html:17633-17650): focusing or typing opens it, closing (outside click, Escape, or
 * `useQuickAssistStore`'s `open` flipping false via the global ⌘K handler in `App.tsx`) clears the
 * query and blurs, matching legacy's own real behavior exactly. `quickAssistStore.ts`'s own header
 * already noted its `open`/`openBox`/`closeBox`/`toggleBox` shape "matches legacy's real
 * setQaOpen/toggleQa... minus zen-mode chrome-reveal side effects" -- only this component's own
 * rendering needed to change to actually use that shape the way legacy does, not the store itself.
 */
const HINT_PHRASES = ['hide file explorer', 'toggle dark mode', 'duplicate node', 'rewrite this node', 'toggle compact rows', 'generate outline'];

export function QuickAssistBar({ openRestructureDialog }: { openRestructureDialog: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const open = useQuickAssistStore((s) => s.open);
  const openBox = useQuickAssistStore((s) => s.openBox);
  const closeBox = useQuickAssistStore((s) => s.closeBox);
  const quickAssistEnabled = useOutlinePrefsStore((s) => s.quickAssistEnabled);
  const quickAssistSearchEnabled = useOutlinePrefsStore((s) => s.quickAssistSearchEnabled);
  const hasSelection = useOutlineStore((s) => s.selectedId !== null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Matches legacy's real `setQaOpen(true)` (focuses the input on a short delay) and
  // `setQaOpen(false)` (clears the input value and blurs) exactly.
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(timer);
    }
    setQuery('');
    setActiveIndex(0);
    setPickerOpen(false);
    inputRef.current?.blur();
  }, [open]);

  // Matches legacy's own real document-level outside-click close (the input row and the dropdown
  // both stop propagation on their own clicks, legacy/index.html:17727-17728).
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeBox();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, closeBox]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const actions = buildQaActionsWithRestructureDialog(openRestructureDialog);
  const entries: QaEntry[] = pickerOpen ? buildQaPickerEntries() : buildQaEntries(query, hasSelection, actions, quickAssistSearchEnabled);
  const navEntries = navigableQaEntries(entries);

  function showToast(message: string, undo?: () => void): void {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, undo });
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }

  function activate(entry: QaEntry): void {
    if (entry.kind === 'verb' || entry.kind === 'category') {
      // Stepping stones, not completed actions -- matches legacy's real qaActivateSelection,
      // which deliberately skips setQaOpen(false) for these two kinds (legacy/index.html:
      // 17488-17505): insert the picked verb/category prefix into the input, keep the box open,
      // refocus so typing continues right where the picker left off.
      setQuery(qaPickerInsertText(entry));
      setPickerOpen(false);
      setActiveIndex(0);
      inputRef.current?.focus();
      return;
    }
    if (entry.kind === 'command') {
      const result = qaExecuteCommand(entry.cmd, entry.verb);
      showToast(result.message, result.undo);
    } else if (entry.kind === 'action') {
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
    } else {
      // Search-hit rows navigate instead of executing -- matches legacy's own real
      // qaActivateSelection: `else entry.item.action();` with no toast, since navigating is its
      // own visible feedback.
      entry.hit.action();
    }
    closeBox();
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === ' ' && !query.trim() && !pickerOpen) {
      // Space on a genuinely empty box opens the category picker inline, matching legacy's real
      // `#qa-input` keydown handler exactly (legacy/index.html:17768-17774).
      e.preventDefault();
      setPickerOpen(true);
      setActiveIndex(0);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (pickerOpen) {
        setPickerOpen(false);
        setActiveIndex(0);
        return;
      }
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
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="qa-input-row">
        <button
          type="button"
          className="qa-icon-btn"
          onClick={() => {
            openBox();
            setPickerOpen(true);
            setActiveIndex(0);
            inputRef.current?.focus();
          }}
          title="Browse by category"
          aria-label="Browse Quick Assist categories"
        >
          <QaCategoryIcon width={14} height={14} />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={openBox}
          onChange={(e) => {
            openBox();
            setQuery(e.currentTarget.value);
            setActiveIndex(0);
            setPickerOpen(false);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search…"
          autoComplete="off"
          aria-label="Quick assist command and search input"
        />
      </div>
      {open && (
        <div className="qa-dropdown" role="dialog" aria-label="Quick Assist">
          <div>
            {pickerOpen && (
              <>
                <div className="gs-group-title">Browse by action…</div>
                <div className="qa-chip-row">
                  {entries
                    .filter((e): e is Extract<QaEntry, { kind: 'verb' }> => e.kind === 'verb')
                    .map((entry) => {
                      const navIndex = navEntries.indexOf(entry);
                      return (
                        <button
                          key={`verb-${entry.verb}`}
                          type="button"
                          className={`qa-item qa-item-chip${navIndex === activeIndex ? ' qa-active' : ''}`}
                          onClick={() => activate(entry)}
                          onMouseEnter={() => setActiveIndex(navIndex)}
                        >
                          <span className="qa-item-label">{QA_PICKER_VERB_LABELS[entry.verb]}</span>
                        </button>
                      );
                    })}
                </div>
                <div className="gs-group-title">Search within…</div>
                <div className="qa-chip-row">
                  {entries
                    .filter((e): e is Extract<QaEntry, { kind: 'category' }> => e.kind === 'category')
                    .map((entry) => {
                      const navIndex = navEntries.indexOf(entry);
                      return (
                        <button
                          key={`cat-${entry.categoryKey}`}
                          type="button"
                          className={`qa-item qa-item-chip${navIndex === activeIndex ? ' qa-active' : ''}`}
                          onClick={() => activate(entry)}
                          onMouseEnter={() => setActiveIndex(navIndex)}
                        >
                          <span className="qa-item-label">{entry.group}</span>
                        </button>
                      );
                    })}
                </div>
              </>
            )}
            {!pickerOpen && !query.trim() && (
              <div className="qa-hint">
                <div className="qa-hint-label">Try things like</div>
                <div className="qa-hint-phrases">
                  {HINT_PHRASES.map((phrase) => (
                    <span
                      key={phrase}
                      role="button"
                      tabIndex={0}
                      className="qa-hint-phrase"
                      onClick={() => {
                        setQuery(phrase);
                        setActiveIndex(0);
                        inputRef.current?.focus();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setQuery(phrase);
                          setActiveIndex(0);
                          inputRef.current?.focus();
                        }
                      }}
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!pickerOpen && !!query.trim() && entries.length === 0 && (
              <div style={{ fontSize: 12, color: t.mutedText, padding: '8px 4px' }}>No matching command or content for &quot;{query.trim()}&quot;</div>
            )}
            {!pickerOpen && entries.length > 0 && (
              <div className="qa-results">
                {entries.map((entry, i) => {
                  if (entry.kind === 'command') {
                    const navIndex = navEntries.indexOf(entry);
                    const verbLabel = qaVerbLabel(entry.verb, entry.cmd);
                    const verbClass = verbLabel === 'Hide' ? ' qa-verb-hide' : '';
                    return (
                      <button
                        key={`cmd-${entry.cmd.id}`}
                        type="button"
                        className={`qa-item${navIndex === activeIndex ? ' qa-active' : ''}`}
                        onClick={() => activate(entry)}
                        onMouseEnter={() => setActiveIndex(navIndex)}
                      >
                        <span className={`qa-item-verb${verbClass}`}>{verbLabel}</span>
                        <span className="qa-item-label">{entry.cmd.label}</span>
                        <span className="qa-item-state">{entry.cmd.get() ? 'currently on' : 'currently off'}</span>
                      </button>
                    );
                  }
                  if (entry.kind === 'action') {
                    const navIndex = entry.disabled ? -1 : navEntries.indexOf(entry);
                    return (
                      <button
                        key={`action-${entry.action.id}`}
                        type="button"
                        disabled={entry.disabled}
                        className={`qa-item qa-verb-run${entry.disabled ? ' qa-item-disabled' : navIndex === activeIndex ? ' qa-active' : ''}`}
                        onClick={() => activate(entry)}
                        onMouseEnter={() => {
                          if (!entry.disabled) setActiveIndex(navIndex);
                        }}
                      >
                        <span className="qa-item-verb qa-verb-run">Run</span>
                        <span className="qa-item-label">{entry.action.label}</span>
                        {entry.disabled && <span className="qa-item-state">select a node first</span>}
                      </button>
                    );
                  }
                  // Search-hit row -- shows a group header ("Documents", "Notes", ...) whenever the
                  // group changes from the previous entry, matching legacy's own real
                  // `gs-group-title` insertion in qaRender. `verb`/`category` kinds never reach
                  // here: they only exist in `buildQaPickerEntries()`'s own output, rendered by the
                  // `pickerOpen` branch above, never mixed into this list (guarded by `!pickerOpen`).
                  if (entry.kind !== 'search') return null;
                  const prev = entries[i - 1];
                  const showGroupHeader = !prev || prev.kind !== 'search' || prev.group !== entry.group;
                  const navIndex = navEntries.indexOf(entry);
                  return (
                    <div key={`search-${entry.group}-${i}`}>
                      {showGroupHeader && <div className="gs-group-title">{entry.group}</div>}
                      <button
                        type="button"
                        className={`qa-item${navIndex === activeIndex ? ' qa-active' : ''}`}
                        onClick={() => activate(entry)}
                        onMouseEnter={() => setActiveIndex(navIndex)}
                      >
                        <span className="qa-item-verb qa-verb-goto">Go to</span>
                        <span className="qa-item-label">{entry.hit.label}</span>
                        {entry.hit.meta && <span className="qa-item-state">{entry.hit.meta}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
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
