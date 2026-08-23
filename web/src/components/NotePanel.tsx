import { useEffect, useRef } from 'react';
import { useNotePanelStore, NOTE_PANEL_WIDTH } from '../store/notePanelStore';
import { useOutlineStore, CODE_LANGS } from '../store/outlineStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 6.3 slice, part 2 (UI half of the store slice in notePanelStore.ts -- see that file's
 * header comment for full scope/what's deferred). Floating, draggable, maximizable panel with
 * Note/Code tabs, replacing OutlineTree.tsx's old inline per-row textareas (Phase 3). Renders
 * nothing when closed.
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

  const node = nodeId !== null ? nodes.find((n) => n.id === nodeId) ?? null : null;

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

  const hasNoteText = !!node.note?.trim();
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
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 14px 14px' }}>
        {mode === 'note' ? (
          <textarea
            key={node.id}
            defaultValue={node.note}
            autoFocus
            onBlur={(e) => setNote(node.id, e.currentTarget.value)}
            style={{
              width: '100%',
              height: maximized ? '100%' : 180,
              resize: maximized ? 'none' : 'vertical',
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
