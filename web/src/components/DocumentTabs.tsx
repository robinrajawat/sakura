import { useEffect, useState } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 5 slice (docs/framework-migration-plan.md): Documents & Tabs, part 2 -- the UI. A tab
 * strip (double-click to rename, X to close, drag to reorder) plus a document picker dropdown
 * listing every document that exists (not just open ones), matching README's own "clicking a
 * document in the file explorer... opens it as a tab" and "the X icon closes the tab only"
 * behavior.
 *
 * Drag-to-reorder (Phase 6.1, docs/phase6-full-parity-plan.md's 6.1 section) uses native HTML5
 * drag-and-drop rather than a library -- a tab strip is exactly the "reorder items within one
 * row" case that API is designed for, and documentsStore.ts's `reorderTab` action already wraps
 * the pure, already-tested `tabOrder.ts` logic this needed. No searchable tab-switcher dropdown
 * for overflow, no folders -- each a real, separately-scoped follow-up (documentsStore.ts's own
 * header has the fuller list).
 */
export function DocumentTabs() {
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const openTabs = useDocumentsStore((s) => s.openTabs);
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const init = useDocumentsStore((s) => s.init);
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const openDocument = useDocumentsStore((s) => s.openDocument);
  const closeTab = useDocumentsStore((s) => s.closeTab);
  const switchTab = useDocumentsStore((s) => s.switchTab);
  const renameDocument = useDocumentsStore((s) => s.renameDocument);
  const reorderTab = useDocumentsStore((s) => s.reorderTab);
  const theme = useThemeStore((s) => s.theme);
  const accentColor = useThemeStore((s) => s.accentColor());
  const t = THEME_TOKENS[theme];
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'left' | 'right' } | null>(null);

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime (it restores persisted state) -- same
    // deliberate empty-dependency-array convention as AuthPanel.tsx's own init() effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function titleFor(id: string): string {
    return docsIndex.find((d) => d.id === id)?.title ?? 'Untitled';
  }

  function clearDrag(): void {
    setDraggedId(null);
    setDropTarget(null);
  }

  const closedDocs = docsIndex.filter((d) => !openTabs.includes(d.id));

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {openTabs.map((id) => {
          const isDropTarget = dropTarget?.id === id;
          return (
            <div
              key={id}
              onClick={() => switchTab(id)}
              draggable={renamingId !== id}
              onDragStart={(e) => {
                setDraggedId(id);
                // The dragged id is read back from dataTransfer in onDrop below, not from this
                // React state -- setData is readable at 'drop' regardless of whether this
                // component's state update from setDraggedId has flushed to a re-render yet by
                // the time dragover/drop fire (dragover can fire before React's next render
                // commits, since the browser doesn't wait on it). `draggedId` state still drives
                // the dimmed-tab visual below; a one-frame lag there is only cosmetic.
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                // Always preventDefault -- per the HTML5 DnD spec, omitting this on ANY dragover
                // (even conditionally, e.g. only once `draggedId` state has caught up) tells the
                // browser this element doesn't accept a drop at all, and the drop event never
                // fires. Gating this behind React state was the original bug here.
                e.preventDefault();
                if (draggedId === id) return; // no indicator when hovering the dragged tab itself
                const rect = e.currentTarget.getBoundingClientRect();
                const side: 'left' | 'right' = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
                if (dropTarget?.id !== id || dropTarget.side !== side) setDropTarget({ id, side });
              }}
              onDrop={(e) => {
                e.preventDefault();
                // Read the source id from dataTransfer, NOT from `draggedId` React state -- for
                // the same reason onDragOver above always calls preventDefault regardless of
                // state: this handler needs to be correct even if this component's state update
                // from onDragStart hasn't been committed to a render yet. dataTransfer.getData is
                // reliably readable at 'drop' per spec (unlike during 'dragover', where browsers
                // withhold it for security reasons -- that restriction is exactly why the
                // indicator above has to use React state instead).
                const sourceId = e.dataTransfer.getData('text/plain');
                const rect = e.currentTarget.getBoundingClientRect();
                const side: 'left' | 'right' = e.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
                if (sourceId && sourceId !== id) reorderTab(sourceId, id, side);
                clearDrag();
              }}
              onDragEnd={clearDrag}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                background: id === activeDocId ? t.selectedBg : 'transparent',
                border: `1px solid ${t.border}`,
                opacity: draggedId === id ? 0.4 : 1,
                borderLeft: isDropTarget && dropTarget.side === 'left' ? `2px solid ${accentColor}` : `1px solid ${t.border}`,
                borderRight: isDropTarget && dropTarget.side === 'right' ? `2px solid ${accentColor}` : `1px solid ${t.border}`
              }}
            >
              {renamingId === id ? (
                <input
                  autoFocus
                  defaultValue={titleFor(id)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    renameDocument(id, e.currentTarget.value || 'Untitled');
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  style={{ fontSize: 12, width: 100 }}
                />
              ) : (
                <span
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(id);
                  }}
                >
                  {titleFor(id)}
                </span>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
                style={{ color: t.mutedText, cursor: 'pointer', fontSize: 11 }}
              >
                ✕
              </span>
            </div>
          );
        })}
        <button type="button" onClick={() => newDocument()} title="New document">
          +
        </button>
        {closedDocs.length > 0 && (
          <select
            value=""
            onChange={(e) => e.currentTarget.value && openDocument(e.currentTarget.value)}
            style={{ fontSize: 12 }}
          >
            <option value="">Open document...</option>
            {closedDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
