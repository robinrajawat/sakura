import { useEffect, useRef, useState } from 'react';
import { useNotePanelStore, NOTE_PANEL_WIDTH } from '../store/notePanelStore';
import { useOutlineStore, CODE_LANGS } from '../store/outlineStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { stripHtmlToText } from '../utils/stripHtmlToText';
import { sanitizeHrefUrl } from '../utils/sanitizeHrefUrl';
import { escapeHtml } from '../utils/escapeHtml';

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
 *
 * Link insertion (the toolbar's Link button) is its own small slice on top of that: a saved
 * `Range` from the moment the button is clicked (contenteditable loses its selection the instant
 * focus moves to an input), a lightweight inline prompt (Text/URL fields) in place of legacy's
 * full `_openModal`/`sakuraLinkPrompt` system -- which this app has no equivalent of yet and
 * isn't worth building just for this -- and `sanitizeHrefUrl` (ported from legacy) run on the
 * URL before it ever reaches the inserted `<a>`, on top of `sanitizeRichHtml`'s own href check
 * at commit time.
 *
 * Image insertion (the toolbar's Image button) is a third small slice: an off-DOM file input,
 * `FileReader.readAsDataURL` to get a base64 data: URI, then `execCommand('insertImage', ...)`
 * -- direct port of legacy's `ntb-image` handler (legacy/index.html:33946-33967). No dedicated
 * click-to-select/resize handling yet (legacy's `.editor-img-selected` outline/drag-resize is a
 * separate, later slice) -- inserted images just get legacy's own `max-width:100%` CSS so they
 * never overflow the panel.
 *
 * Table insertion (the toolbar's Table button) is a fourth small slice: inserts a 2x2 table
 * (1 header row + 2 data rows, `contenteditable` cells) via direct DOM construction + Range
 * insertion, matching legacy's `ntb-table` handler structurally. Column resize handles and the
 * right-click add/remove row/column context menu (legacy's `_attachTableResizeHandles`/
 * `_noteCtxTableMutated`) are deliberately deferred -- cells are directly editable and typable
 * without them, just not resizable/extendable yet.
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
  const savedRangeRef = useRef<Range | null>(null);
  const [linkPrompt, setLinkPrompt] = useState<{ text: string; url: string; hadExisting: boolean } | null>(
    null
  );

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

  // Opens the link prompt: saves the current selection Range (lost the instant an <input>
  // takes focus) and pre-fills from an existing link if the caret/selection is inside one,
  // matching legacy's own ntb-link handler (legacy/index.html:33783-33795).
  const openLinkPrompt = () => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    savedRangeRef.current = range;
    const anchorEl = sel?.anchorNode
      ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE
          ? (sel.anchorNode as Element)
          : sel.anchorNode.parentElement
        )?.closest('a')
      : null;
    const selectedText = sel ? sel.toString() : '';
    setLinkPrompt({
      text: anchorEl ? anchorEl.textContent || '' : selectedText,
      url: anchorEl ? anchorEl.getAttribute('href') || '' : 'https://',
      hadExisting: !!anchorEl
    });
  };

  const confirmLinkPrompt = () => {
    if (!linkPrompt) return;
    const range = savedRangeRef.current;
    const sel = window.getSelection();
    noteEditorRef.current?.focus();
    if (range && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      if (linkPrompt.hadExisting) {
        // Re-select the whole existing <a> so insertHTML/unlink replaces it cleanly, matching
        // legacy's own "select the existing anchor node first" step.
        const anchorEl = (
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as Element)
            : range.startContainer.parentElement
        )?.closest('a');
        if (anchorEl) {
          const r = document.createRange();
          r.selectNode(anchorEl);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
    }
    const url = sanitizeHrefUrl(linkPrompt.url);
    if (!url) {
      document.execCommand('unlink');
    } else {
      const text = linkPrompt.text.trim() || url;
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escapeHtml(url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`
      );
    }
    setLinkPrompt(null);
    savedRangeRef.current = null;
    commitNote();
  };

  // Insert-image-from-file, matching legacy's ntb-image handler (legacy/index.html:33946-33967):
  // an off-DOM file input, read the chosen file as a data: URI via FileReader, insert via
  // execCommand once loaded. sanitizeRichHtml doesn't block data: URIs (only javascript: on
  // href/src/action/formaction), so these survive the commit-time sanitize pass untouched.
  const insertImageFromFile = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(fileInput);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) {
        fileInput.remove();
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        noteEditorRef.current?.focus();
        document.execCommand('insertImage', false, evt.target?.result as string);
        commitNote();
        fileInput.remove();
      };
      reader.readAsDataURL(file);
    });
    fileInput.click();
  };

  // Insert a 2x2 table (1 header row, 2 data rows) at the cursor, matching legacy's ntb-table
  // handler (legacy/index.html:33815-33858) structurally -- same colgroup-for-fixed-widths/
  // thead+th/tbody+td shape, same default 2 columns/120px starting width. Column resize handles
  // and the right-click add/remove row/column context menu (legacy's _attachTableResizeHandles/
  // _noteCtxTableMutated) are deliberately deferred to a later slice -- cells are still directly
  // editable and typable without them, just not resizable/extendable yet.
  const insertTable = () => {
    noteEditorRef.current?.focus();
    const cols = 2;
    const defaultColW = 120;
    const table = document.createElement('table');

    const colgroup = document.createElement('colgroup');
    for (let i = 0; i < cols; i++) {
      const col = document.createElement('col');
      col.style.width = `${defaultColW}px`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);

    const thead = table.createTHead();
    const headRow = thead.insertRow();
    ['Column 1', 'Column 2'].forEach((text) => {
      const th = document.createElement('th');
      th.contentEditable = 'true';
      th.textContent = text;
      headRow.appendChild(th);
    });

    const tbody = table.createTBody();
    for (let r = 0; r < 2; r++) {
      const row = tbody.insertRow();
      for (let c = 0; c < cols; c++) {
        const td = row.insertCell();
        td.contentEditable = 'true';
      }
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(table);
      const firstCell = tbody.rows[0].cells[0];
      const newRange = document.createRange();
      newRange.setStart(firstCell, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } else {
      noteEditorRef.current?.appendChild(table);
    }
    commitNote();
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
              <button
                type="button"
                title="Insert / edit link"
                onMouseDown={(e) => {
                  e.preventDefault();
                  openLinkPrompt();
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
                🔗
              </button>
              <button
                type="button"
                title="Insert image from file"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertImageFromFile();
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
                🖼
              </button>
              <button
                type="button"
                title="Insert table (2×2 to start)"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertTable();
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
                ⊞
              </button>
            </div>
            <style>{`
              .sakura-note-editor img { max-width: 100%; border-radius: 6px; margin: 4px 0; display: block; }
              .sakura-note-editor table { border-collapse: collapse; margin: 6px 0; font-size: 12px; table-layout: fixed; }
              .sakura-note-editor table td, .sakura-note-editor table th {
                border: 1px solid ${t.border}; padding: 5px 8px; min-width: 32px;
                vertical-align: top; outline: none; overflow: hidden; word-break: break-word;
              }
              .sakura-note-editor table th { background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
              .sakura-note-editor table td:focus, .sakura-note-editor table th:focus {
                box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
              }
            `}</style>
            <div
              key={node.id}
              ref={noteEditorRef}
              className="sakura-note-editor"
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
      {linkPrompt && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLinkPrompt(null);
          }}
        >
          <div
            style={{
              background: t.background,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: 14,
              width: 280,
              boxShadow: '0 8px 24px rgba(0,0,0,.2)'
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              {linkPrompt.hadExisting ? 'Edit Link' : 'Insert Link'}
            </div>
            <label style={{ display: 'block', fontSize: 11, color: t.hintText, marginBottom: 2 }}>
              Text to display
            </label>
            <input
              value={linkPrompt.text}
              placeholder="Link text (optional)"
              onChange={(e) => setLinkPrompt({ ...linkPrompt, text: e.currentTarget.value })}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 8,
                padding: 5,
                border: `1px solid ${t.border}`,
                borderRadius: 4,
                background: t.editBg,
                color: t.text,
                fontSize: 12
              }}
            />
            <label style={{ display: 'block', fontSize: 11, color: t.hintText, marginBottom: 2 }}>Link</label>
            <input
              value={linkPrompt.url}
              placeholder="https://"
              autoFocus
              onChange={(e) => setLinkPrompt({ ...linkPrompt, url: e.currentTarget.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLinkPrompt();
                if (e.key === 'Escape') setLinkPrompt(null);
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginBottom: 12,
                padding: 5,
                border: `1px solid ${t.border}`,
                borderRadius: 4,
                background: t.editBg,
                color: t.text,
                fontSize: 12
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button
                type="button"
                onClick={() => setLinkPrompt(null)}
                style={{
                  border: `1px solid ${t.border}`,
                  background: 'transparent',
                  color: t.text,
                  borderRadius: 4,
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLinkPrompt}
                style={{
                  border: 'none',
                  background: t.text,
                  color: t.background,
                  borderRadius: 4,
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
