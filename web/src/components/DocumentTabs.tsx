import { useEffect, useRef, useState } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useSidebarStore } from '../store/sidebarStore';
import { filterTabsByTitle, moveOverviewSelection } from '../state/tabOrder';
import { CloseIcon, SidebarToggleIcon } from '../icons';

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
 * the pure, already-tested `tabOrder.ts` logic this needed.
 *
 * The searchable tab-switcher dropdown (▾, Phase 6.1) matches legacy's own "search open tabs"
 * overview (legacy/index.html:10700-10736: `openTabOverviewMenu`/`renderTabOverviewList`) --
 * live-filtered list of OPEN tabs (not the closed-docs picker below, which is a different,
 * pre-existing dropdown), arrow-key navigation with wraparound, Enter to activate, Escape and
 * click-outside to close, active doc highlighted. Deliberately without legacy's per-tab
 * "dirty" dot: `web/` has no manual-save/dirty-tracking concept at all -- autosave
 * (documentsStore.ts's own debounced subscription) is the only save path, so there is no
 * "unsaved changes" state to indicate. No folders -- a real, separately-scoped follow-up
 * (documentsStore.ts's own header has the fuller list).
 *
 * Colors are real CSS custom properties (`var(--sel)`, `var(--accent)`, etc.), matching
 * AppShell.tsx and themeStore.ts's own `CSS_VAR_MAP` -- this component no longer subscribes to
 * `theme`/`accentPreset` at all for styling purposes; see AppShell.tsx's own header for why.
 *
 * §8.4e retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `#doc-tab-strip`/`.doc-tab`/`.doc-tab-add`/`.doc-tab-overview-*` classes (index.css) instead of
 * the ad hoc inline `style` objects this component started with. `.doc-tab-dirty`/`.is-dirty` and
 * `.doc-tab.pinned` are deliberately not used here -- see index.css's own header comment on this
 * class family for why (no dirty-tracking or pinning concept exists in `web/` to back them).
 *
 * The tabs themselves are wrapped in their own `#doc-tab-strip` div, matching legacy's real
 * structure (legacy/index.html:6336-6349) exactly: `#doc-tab-strip` is a SEPARATE, narrower,
 * `overflow-x:auto` scrolling element nested INSIDE `#doc-tab-strip-row` (AppShell.tsx's own
 * wrapper), with the "+" button and the tab-overview dropdown as its SIBLINGS, not its
 * descendants. A real, previously-invisible browser bug found while building this slice explains
 * why that split matters, not just naming: an earlier version of this component wrapped
 * everything (tabs, "+", AND the dropdown) in one `#doc-tab-strip` div, which made the dropdown a
 * descendant of the same `overflow-x:auto` element it scrolls inside of -- focusing the
 * dropdown's `autoFocus` search input then triggered Chromium's scroll-into-view behavior on
 * that ancestor (even with `overflow-y:hidden`), silently shifting every tab and the dropdown
 * itself upward by the resulting scroll offset every single time the dropdown opened. Keeping
 * the dropdown outside `#doc-tab-strip` (matching legacy) avoids the bug structurally instead of
 * working around it in JS.
 */
export function DocumentTabs() {
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'left' | 'right' } | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overviewQuery, setOverviewQuery] = useState('');
  const [overviewActiveIndex, setOverviewActiveIndex] = useState(0);
  const overviewWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime (it restores persisted state) -- same
    // deliberate empty-dependency-array convention as AuthPanel.tsx's own init() effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!overviewOpen) return;
    function onClickOutside(e: MouseEvent): void {
      if (overviewWrapRef.current && !overviewWrapRef.current.contains(e.target as Node)) {
        setOverviewOpen(false);
      }
    }
    // Matches legacy's own click-outside pattern (legacy/index.html:27291's
    // `tabOverview&&!tabOverview.contains(e.target)&&closeTabOverviewMenu()`) -- a document-level
    // listener only while the menu is actually open, torn down on close/unmount.
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [overviewOpen]);

  function titleFor(id: string): string {
    return docsIndex.find((d) => d.id === id)?.title ?? 'Untitled';
  }

  function clearDrag(): void {
    setDraggedId(null);
    setDropTarget(null);
  }

  const closedDocs = docsIndex.filter((d) => !openTabs.includes(d.id));

  const overviewMatches = filterTabsByTitle(
    openTabs.map((id) => ({ id, title: titleFor(id) })),
    overviewQuery
  );

  function openOverview(): void {
    setOverviewQuery('');
    setOverviewActiveIndex(0);
    setOverviewOpen(true);
  }

  function activateOverviewSelection(): void {
    const match = overviewMatches[overviewActiveIndex];
    if (!match) return;
    setOverviewOpen(false);
    if (match.id !== activeDocId) switchTab(match.id);
  }

  return (
    <>
      {/* §8.15 slice (docs/phase8-design-system-parity-plan.md): direct port of legacy's real
          `#sidebar-reopen-btn` (legacy/index.html:1623-1624, 6337) -- the reopen half of legacy's
          real two-button sidebar-toggle split (the collapse half, `#sidebar-toggle`, lives in
          SidebarFileExplorer.tsx's own section header instead). Shown only while the sidebar is
          closed, matching legacy's own `rb.style.display=open?'none':'inline-flex'` exactly. */}
      {!sidebarOpen && (
        <button
          id="sidebar-reopen-btn"
          type="button"
          onClick={toggleSidebarOpen}
          title="Show file explorer"
          aria-label="Show file explorer"
        >
          <SidebarToggleIcon width={16} height={16} />
        </button>
      )}
      <div id="doc-tab-strip" role="tablist" aria-label="Open documents">
        {openTabs.map((id) => {
          const isDropTarget = dropTarget?.id === id;
          const dragOverClass = isDropTarget ? (dropTarget.side === 'left' ? ' drag-over-left' : ' drag-over-right') : '';
          return (
            <div
              key={id}
              className={`doc-tab${id === activeDocId ? ' active' : ''}${draggedId === id ? ' dragging' : ''}${dragOverClass}`}
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
            >
              {renamingId === id ? (
                <input
                  className="doc-tab-title"
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
                  className="doc-tab-title"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(id);
                  }}
                >
                  {titleFor(id)}
                </span>
              )}
              <span
                className="doc-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(id);
                }}
              >
                <CloseIcon width={12} height={12} />
              </span>
            </div>
          );
        })}
      </div>
      <button type="button" className="doc-tab-add" onClick={() => newDocument()} title="New document">
        +
      </button>
      <div ref={overviewWrapRef} className="doc-tab-overview-wrap">
        <button
          type="button"
          className="doc-tab-overview-btn"
          onClick={() => (overviewOpen ? setOverviewOpen(false) : openOverview())}
          title="Search open tabs"
          aria-label="Search open tabs"
        >
          ▾
        </button>
        {overviewOpen && (
          <div className="doc-tab-overview-menu">
            <input
              autoFocus
              type="text"
              placeholder="Search open tabs…"
              autoComplete="off"
              aria-label="Search open tabs"
              value={overviewQuery}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setOverviewQuery(e.currentTarget.value);
                setOverviewActiveIndex(0);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setOverviewOpen(false);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOverviewActiveIndex((i) => moveOverviewSelection(i, overviewMatches.length, 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setOverviewActiveIndex((i) => moveOverviewSelection(i, overviewMatches.length, -1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  activateOverviewSelection();
                }
              }}
            />
            {overviewMatches.length === 0 ? (
              <div className="doc-tab-overview-empty">No open tabs match &quot;{overviewQuery.trim()}&quot;</div>
            ) : (
              overviewMatches.map((item, idx) => {
                const isActiveDoc = item.id === activeDocId;
                const isKeyboardActive = idx === overviewActiveIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`doc-tab-overview-item${isActiveDoc ? ' active' : ''}${isKeyboardActive ? ' kbd-active' : ''}`}
                    onClick={() => {
                      setOverviewOpen(false);
                      if (!isActiveDoc) switchTab(item.id);
                    }}
                    onMouseEnter={() => setOverviewActiveIndex(idx)}
                  >
                    <span className="doc-tab-overview-title">{item.title}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
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
    </>
  );
}
