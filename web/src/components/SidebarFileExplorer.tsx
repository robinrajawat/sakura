import { useRef, useState } from 'react';
import { useDocumentsStore, type DocSummary } from '../store/documentsStore';
import { useSidebarStore } from '../store/sidebarStore';
import { flattenFolderTree } from '../state/folderTree';

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
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
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
    return (
      <div
        key={doc.id}
        data-doc-id={doc.id}
        onClick={() => openDocument(doc.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 6px',
          borderRadius: 6,
          cursor: 'pointer',
          color: 'var(--fg)'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title}
        </span>
        {moveToFolderSelect(doc)}
      </div>
    );
  }

  return (
    <div ref={scrollRef} style={{ padding: '8px 8px 8px', overflowY: 'auto', fontSize: 12 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--hint)',
          fontWeight: 600,
          textTransform: 'uppercase',
          fontSize: 10,
          padding: '4px 4px 6px'
        }}
      >
        <span>Documents</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={locateActiveDoc} disabled={!activeDocId} title="Locate the open document" style={{ fontSize: 11 }}>
            🎯
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            title={searchOpen ? 'Hide filter box' : 'Show filter box'}
            aria-pressed={searchOpen}
            aria-label="Toggle file explorer filter box"
            style={{ fontSize: 11 }}
          >
            🔍
          </button>
          <button type="button" onClick={() => createFolder(null)} title="New folder" style={{ fontSize: 11 }}>
            📁+
          </button>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 4px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span
                onClick={() => toggleFolderOpen(folder.id)}
                style={{ width: 12, display: 'inline-block', color: 'var(--muted)', cursor: 'pointer' }}
              >
                {isOpen ? '▾' : '▸'}
              </span>
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
                  style={{ fontSize: 12, flex: '1 1 auto', minWidth: 0 }}
                />
              ) : (
                <span
                  onClick={() => toggleFolderOpen(folder.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenamingFolderId(folder.id);
                  }}
                  style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {folder.name}
                </span>
              )}
              <span style={{ color: 'var(--hint)', fontSize: 10 }}>{directDocs.length}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  newDocument(folder.id);
                }}
                title="New document in this folder"
                style={{ fontSize: 10 }}
              >
                +
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingFolderId(folder.id);
                }}
                title="Rename folder"
                style={{ fontSize: 10 }}
              >
                ✎
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Delete this folder? Documents inside will move to Unfiled.')) {
                    deleteFolder(folder.id);
                  }
                }}
                title="Delete folder"
                style={{ fontSize: 10, color: 'var(--fc-red, inherit)' }}
              >
                ✕
              </button>
            </div>
            {isOpen && (
              <div style={{ marginLeft: 16 }}>
                {isEmpty ? (
                  <div style={{ color: 'var(--hint)', padding: '2px 4px', fontSize: 11 }}>Empty folder</div>
                ) : (
                  directDocs.map((d) => <DocRow key={d.id} doc={d} />)
                )}
              </div>
            )}
          </div>
        );
      })}

      {folders.length > 0 && unfiledDocs.length > 0 && (
        <div style={{ color: 'var(--hint)', fontSize: 10, padding: '8px 4px 4px', fontWeight: 600, textTransform: 'uppercase' }}>
          Unfiled
        </div>
      )}
      {noResults ? (
        <div style={{ color: 'var(--hint)', padding: '4px 4px' }}>No matching documents</div>
      ) : docsIndex.length === 0 ? (
        <div style={{ color: 'var(--hint)', padding: '4px 4px' }}>No documents yet</div>
      ) : (
        unfiledDocs.map((d) => <DocRow key={d.id} doc={d} />)
      )}

      {/* §7.7 slice: Templates section shell -- see this file's own header for exactly what's
          real here (the chrome) vs. deliberately not (the save-as-template flow itself). */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'var(--hint)',
            fontWeight: 600,
            textTransform: 'uppercase',
            fontSize: 10,
            padding: '4px 4px 6px'
          }}
        >
          <span>Templates</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" disabled title="New template folder — templates aren't available in web/ yet" style={{ fontSize: 11 }}>
              📁+
            </button>
            <button type="button" disabled title="Save / manage templates — templates aren't available in web/ yet" style={{ fontSize: 11 }}>
              ⋯
            </button>
          </div>
        </div>
        <div style={{ color: 'var(--hint)', padding: '2px 4px', fontSize: 11 }}>No templates yet</div>
      </div>

      {/* §7.7 slice: Trash section shell -- see this file's own header for why the count is
          always 0 and the expanded state always shows "Trash is empty" today. */}
      <div style={{ marginTop: 10, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <div
          onClick={() => setTrashOpen((open) => !open)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px', borderRadius: 6, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ width: 12, display: 'inline-block', color: 'var(--muted)' }}>{trashOpen ? '▾' : '▸'}</span>
          <span style={{ flex: '1 1 auto' }}>Trash</span>
          <span style={{ color: 'var(--hint)', fontSize: 10 }}>0</span>
        </div>
        {trashOpen && <div style={{ color: 'var(--hint)', padding: '2px 4px 0 24px', fontSize: 11 }}>Trash is empty</div>}
      </div>
    </div>
  );
}
