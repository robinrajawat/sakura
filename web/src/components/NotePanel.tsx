import { useEffect, useRef } from 'react';
import { useNotePanelStore, NOTE_PANEL_WIDTH } from '../store/notePanelStore';
import { useOutlineStore, CODE_LANGS } from '../store/outlineStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { stripHtmlToText } from '../utils/stripHtmlToText';

const RICH_TEXT_COMMANDS: { cmd: string; label: string; title: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold' },
  { cmd: 'italic', label: 'I', title: 'Italic' },
  { cmd: 'underline', label: 'U', title: 'Underline' },
  { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' }
];

/**
 * Phase 6.3 slice, part 2 (UI half of the store slice in notePanelStore.ts -- see that file's
 * header comment for full scope/what's deferred). Floating, draggable, maximizable panel with
 * Note/Code tabs, replacing OutlineTree.tsx's old inline per-row textareas (Phase 3). Renders
 * nothing when closed.
 *
 * Note body is a real contenteditable rich-text editor (legacy/index.html's `#note-editor` --
 * bold/italic/underline/strike/bullet-list/numbered-list via `document.execCommand`, same six
 * `data-cmd` buttons as legacy's `#note-toolbar`, legacy/index.html:7256-7262). `node.note` now
 * stores sanitized HTML rather than Phase 3's plain text -- every commit runs through
 * `sanitizeRichHtml` first, matching legacy's own commit path. Content is set imperatively via
 * a ref (not React-controlled -- `contentEditable` + React state fight each other on every
 * keystroke) whenever the open node changes, same pattern as legacy's `openNodePanel` setting
 * `editor.innerHTML` once on open. Still deferred: images, tables, links, timestamps, AI
 * rewrite/summarise, backlinks section -- each its own later slice.
 */
export function NotePanel() {
  const open = useNotePanelStore((s) => s.open);
  const nodeId = useNotePanelStore((s) => s.nodeId);
  const mode = useNotePanelStore((s) => s.mode);
  const maximized = useNotePanelStore((s) => s.maximized);
  const position = useNotePanelStore((s) => s.position);
  const closePanel = useNotePanelStore((s) => s.closePanel);
  const setMode = useNotePanelStore((s) => s.setMode);
  const toggleMaximize = useNotePanelStore((s) => s.toggleMaximize);
  const setPosition = useNotePanelStore((s) => s.setPosition);

  const nodes = useOutlineStore((s) => s.nodes);
  const setNote = useOutlineStore((s) => s.setNote);
  const setCodeBlock = useOutlineStore((s) => s.setCodeBlock);

  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  const headerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(
    null
  );
  const noteEditorRef = useRef<HTMLDivElement>(null);

  const node = nodeId !== null ? nodes.find((n) => n.id === nodeId) ?? null : null;

  // Imperatively (re)sync the contenteditable's content whenever the open node or tab changes --
  // NOT React-controlled, since re-rendering innerHTML on every keystroke would fight the
  // browser's own cursor position. Matches legacy's openNodePanel setting editor.innerHTML once.
  useEffect(() => {
    if (!open || mode !== 'note' || !node || !noteEditorRef.current) return;
    noteEditorRef.current.innerHTML = sanitizeRichHtml(node.note || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, node?.id]);

  const commitNote = () => {
    if (!node || !noteEditorRef.current) return;
    setNote(node.id, sanitizeRichHtml(noteEditorRef.current.innerHTML));
  };

  // Esc closes, matching legacy's own note-panel-close tooltip ("Close (Esc)").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closePanel]);

  // Header drag-to-reposition. Doesn't apply while maximized (legacy: "there's nowhere to
  // move to"). Ignores mousedowns on header buttons so close/maximize keep working.
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (maximized) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = headerRef.current?.parentElement?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const { startX, startY, startLeft, startTop } = dragState.current;
      setPosition(startLeft + (ev.clientX - startX), startTop + (ev.clientY - startY));
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  if (!open || !node) return null;

  const hasNoteText = !!stripHtmlToText(node.note).trim();
  const hasCode = !!node.codeBlock?.code?.trim();

  const panelStyle: React.CSSProperties = maximized
    ? { position: 'fixed', inset: 0, width: '100%', maxHeight: '100%', borderRadius: 0, zIndex: 110 }
    : {
        position: 'fixed',
        left: position ? position.left : '50%',
        top: position ? position.top : '50%',
        transform: position ? 'none' : 'translate(-50%, -50%)',
        width: Math.min(NOTE_PANEL_WIDTH, window.innerWidth - 32),
        maxHeight: Math.min(window.innerHeight * 0.72, 540),
        borderRadius: 12,
        zIndex: 100
      };

  return (
    <div
      style={{
        ...panelStyle,
        background: t.background,
        border: `1px solid ${t.border}`,
        boxShadow: '0 14px 36px rgba(0,0,0,.14)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontSize: 13
      }}
    >
      <div
        ref={headerRef}
        onMouseDown={onHeaderMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 8px',
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0,
          cursor: maximized ? 'default' : 'move'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1, minWidth: 0 }}>
          {(['note', 'code'] as const).map((m) => {
            const hasContent = m === 'note' ? hasNoteText : hasCode;
            const selected = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${selected ? t.text : 'transparent'}`,
                  background: 'transparent',
                  color: selected ? t.text : t.mutedText,
                  font: '500 12px inherit',
                  padding: '8px 1px 6px',
                  marginBottom: -8,
                  cursor: 'pointer'
                }}
              >
                {m === 'note' ? 'Note' : 'Code'}
                {hasContent && !selected && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: t.text,
                      marginLeft: 5
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={toggleMaximize}
          title={maximized ? 'Restore' : 'Expand to full view'}
          style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', padding: '2px 5px' }}
        >
          {maximized ? '⤡' : '⤢'}
        </button>
        <button
          type="button"
          onClick={() => closePanel()}
          title="Close (Esc)"
          style={{ border: 'none', background: 'none', color: t.hintText, cursor: 'pointer', padding: '2px 5px' }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: '10px 14px 6px', fontSize: 11, color: t.hintText, flexShrink: 0 }}>
        {String(node.text || '').trim().slice(0, 60)}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column' }}>
        {mode === 'note' ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 2,
                marginBottom: 6,
                flexShrink: 0,
                borderBottom: `1px solid ${t.border}`,
                paddingBottom: 6
              }}
            >
              {RICH_TEXT_COMMANDS.map(({ cmd, label, title }) => (
                <button
                  key={cmd}
                  type="button"
                  title={title}
                  // mousedown+preventDefault, not click -- click would lose the current text
                  // selection to the button's own focus first, same reasoning as legacy's
                  // note-toolbar handlers (legacy/index.html:33771 area).
                  onMouseDown={(e) => {
                    e.preventDefault();
                    noteEditorRef.current?.focus();
                    document.execCommand(cmd);
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
                  {label}
                </button>
              ))}
            </div>
            <div
              key={node.id}
              ref={noteEditorRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={commitNote}
              style={{
                flex: 1,
                width: '100%',
                minHeight: maximized ? undefined : 180,
                overflow: 'auto',
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
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <select
              defaultValue={node.codeBlock?.lang ?? 'plain'}
              onChange={(e) =>
                setCodeBlock(node.id, { lang: e.currentTarget.value, code: node.codeBlock?.code ?? '' })
              }
              style={{ fontSize: 12, marginBottom: 6, alignSelf: 'flex-start' }}
            >
              {CODE_LANGS.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <textarea
              key={node.id}
              defaultValue={node.codeBlock?.code ?? ''}
              onBlur={(e) =>
                setCodeBlock(node.id, { lang: node.codeBlock?.lang ?? 'plain', code: e.currentTarget.value })
              }
              style={{
                flex: 1,
                width: '100%',
                minHeight: maximized ? undefined : 140,
                resize: maximized ? 'none' : 'vertical',
                fontFamily: 'monospace',
                fontSize: 13,
                border: `1px solid ${t.border}`,
                borderRadius: 4,
                padding: 8,
                background: t.codeBg,
                color: t.text,
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
