import { useRef, useState } from 'react';
import { useDocumentsStore, type DocSummary } from '../store/documentsStore';
import { useSidebarStore } from '../store/sidebarStore';
import { flattenFolderTree } from '../state/folderTree';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { TargetIcon, SearchIcon, NewFolderIcon, CloseIcon, TrashIcon, SidebarToggleIcon } from '../icons';
import { Button } from './ui/Button';

/**
 * Phase 6.1's last named remaining gap (docs/phase6-full-parity-plan.md's 6.1 section): a real
 * file explorer, replacing the placeholder closed-docs-only list this sidebar previously showed.
 * Structure and behavior match legacy's own real `renderSidebarDocs` exactly
 * (legacy/index.html:30686-30820): top-level folders render first (each recursively -- its own
 * child folders, then its own directly-filed documents, in that order), followed by an "Unfiled"
 * section for documents with no folder assignment at all (shown without a separator label when
 * there are no folders at all, matching legacy's own `if(folders.length){ ...separator... }`).
 * Documents within a folder/bucket sort by `modifiedAt` descending (legacy's own default absent
 * a manual per-bucket reorder -- `sortDocsForBucket`'s own `updatedAt` fallback,
 * legacy/index.html:29985-29995; web/ has no manual-reorder-within-a-folder concept yet, so that
 * fallback is this component's only sort). Clicking ANY document (open or not) switches to it --
 * a deliberate improvement over the placeholder this replaces, which only showed closed docs;
 * `openDocument` is already idempotent for an already-open tab (documentsStore.ts's own
 * `openDocument`), so one handler covers both cases correctly.
 *
 * Deliberately smaller than legacy's own file explorer, each a separate, real follow-up:
 * - No drag-and-drop to file a document into a folder or to move/reorder folders themselves
 *   (legacy's own `wireSbDropTarget`/`wireFolderDragReorder`). In its place, each document row
 *   gets a real "move to folder" `<select>` -- legacy itself offers this as an explicit
 *   alternative to drag ("move-to-folder button or right-click" per its own help text), not an
 *   invented substitute.
 * - No subtree document-count badge on folder rows (legacy shows "3 directly · 12 total incl.
 *   subfolders" via `folderSubtreeDocCount`) -- just a direct-count badge.
 * - No right-click context menu, no manual per-bucket doc reordering (`docOrderMap`), no delete
 *   confirmation dialog beyond a plain `window.confirm` standing in for legacy's own custom modal.
 *
 * §7.7 slice (docs/phase7-app-shell-and-dashboard-plan.md) added the four items this file's own
 * header used to name as gaps:
 * - **Filter box** (`#sb-toggle-search-btn`/`#sidebar-search`, legacy/index.html:6262-6268,
 *   6294-6299): a header icon toggles a title-filter input; typing narrows both the Documents
 *   tree AND the Unfiled bucket to matching titles, force-opens every folder along the way to a
 *   match (a folder with no matching doc anywhere in its own subtree is hidden entirely, matching
 *   legacy's real `folderSubtreeHasMatch`), and shows "No matching documents" if nothing matches.
 *   One real, deliberate wording deviation from legacy's own placeholder ("Filter docs &
 *   templates…"): this project's own Templates section (below) has no real items to filter yet
 *   (see its own note), so the placeholder here only mentions documents.
 * - **"Locate the open document"** (`#sb-locate-doc-btn`, legacy/index.html:6294-6296): direct
 *   port of legacy's real `revealDocInSidebar` (legacy/index.html:31148-31166) -- opens the
 *   sidebar if collapsed, clears any active filter, opens every ancestor folder of the active
 *   document (`documentsStore.ts`'s new `openFolderChain`, an idempotent "open along this chain"
 *   action distinct from `toggleFolderOpen`), then scrolls that row into view with a brief
 *   background flash. Disabled (not a `showToast('No document open')`, since this project has no
 *   toast infrastructure yet) when nothing is open.
 * - **Templates section shell** (`#sb-templates-section`, legacy/index.html:6314-6328): the real
 *   section header (label + "New template folder"/"Save · manage templates" icon buttons) and an
 *   empty-state list -- deliberately NOT the full save-as-template flow. Templates are "a
 *   separate system entirely" in legacy (docs/phase6-full-parity-plan.md's own 6.1 note,
 *   reconfirmed in docs/post-cutover-backlog.md: "Templates ... never got a system at all") --
 *   `web/` has no template store/data of any kind to back real buttons with yet, so both icon
 *   buttons render disabled with an explanatory title rather than either faking the flow or
 *   silently omitting the chrome a real user would expect to see here.
 * - **Trash section** (`#sb-trash-list`, legacy/index.html:6329): the same real collapsible-row-
 *   plus-live-count chrome as legacy's own `renderSidebarTrash` (legacy/index.html:30528-30538),
 *   not the restore/purge/bulk-select system behind it -- `web/` has no soft-delete concept at
 *   all yet (`deleteDocument` in `documentsStore.ts` is a real, immediate hard delete; also
 *   already named in docs/post-cutover-backlog.md: "no trash concept exists"), so the count is
 *   always 0 and the expanded state always shows "Trash is empty" -- both real and always
 *   currently true, not placeholder text pretending otherwise.
 *
 * §8.4b retrofit (docs/phase8-design-system-parity-plan.md): every row/label/action here now
 * carries legacy's own real `.sb-section-hdr`/`.sfolder-row`/`.sfolder-toggle`/`.sfolder-name`/
 * `.sfolder-count`/`.sfolder-actions`/`.sfolder-children`/`.sdoc-item`/`.sdoc-name-btn`/
 * `.sdoc-actions`/`.sdoc-meta`/`.sdoc-action-btn`/`.sb-unfiled-row`/`.sb-empty` classes
 * (legacy/index.html:1524-1563, 1601-1602, 1618) -- an entire real class family §8.1's own pass
 * never covered (that pass scoped to buttons/menus/chips/badges, not the file explorer's own
 * distinct row system), including the hover-reveal-actions behavior every row/folder actually has
 * in legacy (`.sdoc-actions`/`.sfolder-actions` are `display:none` until `:hover`) that `web/`'s
 * old always-visible inline-styled buttons never matched. The fold-toggle is now a real `<button
 * className="sfolder-toggle">` rendering legacy's own single rotating `▶` glyph (`.open` rotates
 * it via CSS `transform`), not a swap between two different `▾`/`▸` characters.
 *
 * Also added this slice: real Rename/"Move to Trash" buttons on each document row
 * (`.sdoc-action-btn`, `✎` glyph + `TrashIcon`, matching legacy's real `renBtn`/`delBtn` at
 * legacy/index.html:30097-30104) -- both call store actions (`renameDocument`/`deleteDocument`)
 * that already existed with zero UI entry point anywhere in `web/` before this (confirmed via
 * grep: neither was ever called outside `documentsStore.ts` itself, `DocumentTabs.tsx`, and
 * `DocumentHeader.tsx`'s own title-rename input -- none of which cover the sidebar row). Filling
 * this in is a real gap closed, not new capability invented for this slice: the backing logic was
 * already real and tested, just missing the row-level entry point legacy always has. Rename
 * reuses this file's own existing inline-edit pattern (`renamingFolderId`'s sibling,
 * `renamingDocId`), not a `window.prompt`, matching the folder row's own already-established UX.
 * Deliberately NOT added: a Duplicate button (`⧉`, legacy/index.html:30099-30100) -- unlike
 * Rename/Delete, `documentsStore.ts` has no `duplicateDoc` action at all to back it with, so
 * building that button now would be dead UI, not a shortcut (same reasoning `App.tsx`'s own
 * toolbar-group comment already gives for other deferred buttons) -- a real, separately-scoped
 * follow-up, not silently dropped.
 */
export function SidebarFileExplorer() {
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const folders = useDocumentsStore((s) => s.folders);
  const docFolderMap = useDocumentsStore((s) => s.docFolderMap);
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const openDocument = useDocumentsStore((s) => s.openDocument);
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const createFolder = useDocumentsStore((s) => s.createFolder);
  const renameFolder = useDocumentsStore((s) => s.renameFolder);
  const deleteFolder = useDocumentsStore((s) => s.deleteFolder);
  const toggleFolderOpen = useDocumentsStore((s) => s.toggleFolderOpen);
  const openFolderChain = useDocumentsStore((s) => s.openFolderChain);
  const setFolderForDoc = useDocumentsStore((s) => s.setFolderForDoc);
  const renameDocument = useDocumentsStore((s) => s.renameDocument);
  const deleteDocument = useDocumentsStore((s) => s.deleteDocument);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const q = searchQuery.toLowerCase().trim();

  function docsInFolder(folderId: string | null): DocSummary[] {
    return docsIndex.filter((d) => (docFolderMap[d.id] ?? null) === folderId).sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  function matchesQuery(doc: DocSummary): boolean {
    return !q || doc.title.toLowerCase().includes(q);
  }

  // Direct port of legacy's real `folderSubtreeHasMatch` -- a folder is worth showing during a
  // search if it (or any descendant folder) directly holds a matching document, regardless of
  // its own open/closed state (search force-opens every matching folder, same as legacy).
  function folderSubtreeHasMatch(folderId: string): boolean {
    if (docsInFolder(folderId).some(matchesQuery)) return true;
    return folders.filter((f) => f.parentId === folderId).some((f) => folderSubtreeHasMatch(f.id));
  }

  // A folder's rows (and everything inside it) are only rendered while every ancestor up to
  // the root is open -- matches legacy's own `sfolder-children` `hidden` class toggling, just
  // computed here instead of via CSS class since this is real conditional rendering, not a
  // stylesheet. Bypassed entirely while a search is active (every matching folder renders
  // force-open instead, same as legacy's own search behavior).
  function isVisible(entry: { folder: { parentId: string | null }; depth: number }): boolean {
    if (entry.depth === 0) return true;
    let current = entry.folder.parentId;
    while (current) {
      const parent = folders.find((f) => f.id === current);
      if (!parent || !parent.open) return false;
      current = parent.parentId;
    }
    return true;
  }

  const flatFolders = flattenFolderTree(folders).filter((entry) => (q ? folderSubtreeHasMatch(entry.folder.id) : isVisible(entry)));
  const unfiledDocs = docsInFolder(null).filter(matchesQuery);
  const noResults = q.length > 0 && flatFolders.length === 0 && unfiledDocs.length === 0;

  function locateActiveDoc(): void {
    if (!activeDocId) return;
    if (!sidebarOpen) toggleSidebarOpen();
    if (searchQuery) setSearchQuery('');
    const folderId = docFolderMap[activeDocId];
    if (folderId) openFolderChain(folderId);
    setTimeout(() => {
      const row = scrollRef.current?.querySelector<HTMLElement>(`[data-doc-id="${CSS.escape(activeDocId)}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const prevBackground = row.style.background;
      row.style.transition = 'background .2s';
      row.style.background = 'var(--sel)';
      setTimeout(() => {
        row.style.background = prevBackground;
      }, 900);
    }, 30);
  }

  function moveToFolderSelect(doc: DocSummary) {
    const currentFolderId = docFolderMap[doc.id] ?? '';
    return (
      <select
        value={currentFolderId}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setFolderForDoc(doc.id, e.currentTarget.value || null)}
        title="Move to folder"
        style={{ fontSize: 10, maxWidth: 70, opacity: 0.7 }}
      >
        <option value="">Unfiled</option>
        {flattenFolderTree(folders).map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {'—'.repeat(depth)} {folder.name}
          </option>
        ))}
      </select>
    );
  }

  function DocRow({ doc }: { doc: DocSummary }) {
    const isRenaming = renamingDocId === doc.id;
    return (
      <div key={doc.id} data-doc-id={doc.id} className={doc.id === activeDocId ? 'sdoc-item active' : 'sdoc-item'} onClick={() => openDocument(doc.id)}>
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={doc.title}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              renameDocument(doc.id, e.currentTarget.value || 'Untitled');
              setRenamingDocId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="sfolder-name-input"
          />
        ) : (
          <span className="sdoc-name-btn">{doc.title}</span>
        )}
        <span className="sdoc-meta">{formatRelativeTime(doc.modifiedAt)}</span>
        <div className="sdoc-actions">
          {folders.length > 0 && moveToFolderSelect(doc)}
          <button
            type="button"
            className="sdoc-action-btn"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingDocId(doc.id);
            }}
          >
            ✎
          </button>
          <button
            type="button"
            className="sdoc-action-btn danger"
            title="Move to Trash"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Delete this document? This cannot be undone.')) {
                deleteDocument(doc.id);
              }
            }}
          >
            <TrashIcon width={11} height={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="sidebar-scroll" ref={scrollRef} style={{ padding: '8px 8px 8px', overflowY: 'auto', fontSize: 12 }}>
      <div className="sb-section-hdr">
        {/* §8.15 slice (docs/phase8-design-system-parity-plan.md): direct port of legacy's real
            `#sidebar-toggle` (legacy/index.html:1620-1622, 6288) -- the collapse half of legacy's
            real two-button sidebar-toggle split (the reopen half, `#sidebar-reopen-btn`, lives in
            DocumentTabs.tsx's own tab-strip row instead, matching legacy's real DOM exactly). A
            single shared toggle button used to live in App.tsx's header instead, which matched
            neither real legacy button -- see index.css's own correction comment on this. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <button
            id="sidebar-toggle"
            type="button"
            onClick={toggleSidebarOpen}
            title="Toggle file explorer"
            aria-label="Toggle file explorer"
            aria-pressed={sidebarOpen}
          >
            <SidebarToggleIcon width={16} height={16} />
          </button>
          <span className="sb-section-label">Documents</span>
        </div>
        <div className="sb-section-actions">
          <Button variant="sidebar-icon" onClick={locateActiveDoc} disabled={!activeDocId} title="Locate the open document">
            <TargetIcon width={13} height={13} />
          </Button>
          <Button
            variant="sidebar-icon"
            onClick={() => setSearchOpen((open) => !open)}
            title={searchOpen ? 'Hide filter box' : 'Show filter box'}
            aria-pressed={searchOpen}
            aria-label="Toggle file explorer filter box"
          >
            <SearchIcon width={13} height={13} />
          </Button>
          <Button variant="sidebar-icon" onClick={() => createFolder(null)} title="New folder">
            <NewFolderIcon width={13} height={13} />
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div style={{ padding: '0 4px 8px' }}>
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (searchQuery) setSearchQuery('');
              else setSearchOpen(false);
            }}
            placeholder="Filter documents…"
            aria-label="Filter documents"
            autoComplete="off"
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 6px' }}
          />
        </div>
      )}

      {flatFolders.map((entry) => {
        const folder = entry.folder;
        const directDocs = docsInFolder(folder.id).filter(matchesQuery);
        const hasChildFolder = folders.some((f) => f.parentId === folder.id && (!q || folderSubtreeHasMatch(f.id)));
        const isEmpty = directDocs.length === 0 && !hasChildFolder;
        const isOpen = q.length > 0 || folder.open;
        return (
          <div key={folder.id} style={{ marginLeft: entry.depth * 14 }}>
            <div className="sfolder-row">
              <button type="button" className={isOpen ? 'sfolder-toggle open' : 'sfolder-toggle'} onClick={() => toggleFolderOpen(folder.id)}>
                ▶
              </button>
              {renamingFolderId === folder.id ? (
                <input
                  autoFocus
                  defaultValue={folder.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    renameFolder(folder.id, e.currentTarget.value);
                    setRenamingFolderId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="sfolder-name-input"
                />
              ) : (
                <span
                  className="sfolder-name"
                  onClick={() => toggleFolderOpen(folder.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingFolderId(folder.id);
                  }}
                >
                  {folder.name}
                </span>
              )}
              <span className="sfolder-count">{directDocs.length}</span>
              <div className="sfolder-actions">
                <button
                  type="button"
                  className="sdoc-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    newDocument(folder.id);
                  }}
                  title="New document in this folder"
                >
                  +
                </button>
                <button
                  type="button"
                  className="sdoc-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingFolderId(folder.id);
                  }}
                  title="Rename folder"
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="sdoc-action-btn danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this folder? Documents inside will move to Unfiled.')) {
                      deleteFolder(folder.id);
                    }
                  }}
                  title="Delete folder"
                >
                  <CloseIcon width={11} height={11} strokeWidth={2.5} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="sfolder-children">
                {isEmpty ? <div className="sb-empty">Empty folder</div> : directDocs.map((d) => <DocRow key={d.id} doc={d} />)}
              </div>
            )}
          </div>
        );
      })}

      {folders.length > 0 && unfiledDocs.length > 0 && (
        <div className="sb-unfiled-row">
          <span style={{ flex: 1 }}>Unfiled</span>
          <span className="sb-unfiled-count">{unfiledDocs.length}</span>
        </div>
      )}
      {noResults ? (
        <div className="sb-empty">No matching documents</div>
      ) : docsIndex.length === 0 ? (
        <div className="sb-empty">No documents yet</div>
      ) : (
        unfiledDocs.map((d) => <DocRow key={d.id} doc={d} />)
      )}

      {/* §7.7 slice: Templates section shell -- see this file's own header for exactly what's
          real here (the chrome) vs. deliberately not (the save-as-template flow itself). */}
      <div style={{ marginTop: 14 }}>
        <div className="sb-section-hdr">
          <span className="sb-section-label">Templates</span>
          <div className="sb-section-actions">
            <Button variant="sidebar-icon" disabled title="New template folder — templates aren't available in web/ yet">
              <NewFolderIcon width={13} height={13} />
            </Button>
            <Button variant="sidebar-icon" disabled title="Save / manage templates — templates aren't available in web/ yet">
              ⋯
            </Button>
          </div>
        </div>
        <div className="sb-empty">No templates yet</div>
      </div>

      {/* §7.7 slice: Trash section shell -- see this file's own header for why the count is
          always 0 and the expanded state always shows "Trash is empty" today. */}
      <div style={{ marginTop: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <div className="sfolder-row" onClick={() => setTrashOpen((open) => !open)}>
          <button
            type="button"
            className={trashOpen ? 'sfolder-toggle open' : 'sfolder-toggle'}
            onClick={(e) => {
              e.stopPropagation();
              setTrashOpen((open) => !open);
            }}
          >
            ▶
          </button>
          <span className="sfolder-name">Trash</span>
          <span className="sfolder-count">0</span>
        </div>
        {trashOpen && (
          <div className="sfolder-children">
            <div className="sb-empty">Trash is empty</div>
          </div>
        )}
      </div>
    </div>
  );
}
