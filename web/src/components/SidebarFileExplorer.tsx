import { useState } from 'react';
import { useDocumentsStore, type DocSummary } from '../store/documentsStore';
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
 * - No search-time filtering/force-expand, no right-click context menu, no manual per-bucket
 *   doc reordering (`docOrderMap`), no delete confirmation dialog or undo toast (a plain
 *   `window.confirm` stands in for legacy's own custom modal here).
 * - No templates (a separate system in legacy entirely, out of scope per this project's own
 *   discussion of Phase 6.1's folder work).
 */
export function SidebarFileExplorer() {
  const docsIndex = useDocumentsStore((s) => s.docsIndex);
  const folders = useDocumentsStore((s) => s.folders);
  const docFolderMap = useDocumentsStore((s) => s.docFolderMap);
  const openDocument = useDocumentsStore((s) => s.openDocument);
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const createFolder = useDocumentsStore((s) => s.createFolder);
  const renameFolder = useDocumentsStore((s) => s.renameFolder);
  const deleteFolder = useDocumentsStore((s) => s.deleteFolder);
  const toggleFolderOpen = useDocumentsStore((s) => s.toggleFolderOpen);
  const setFolderForDoc = useDocumentsStore((s) => s.setFolderForDoc);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);

  function docsInFolder(folderId: string | null): DocSummary[] {
    return docsIndex.filter((d) => (docFolderMap[d.id] ?? null) === folderId).sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  // A folder's rows (and everything inside it) are only rendered while every ancestor up to
  // the root is open -- matches legacy's own `sfolder-children` `hidden` class toggling, just
  // computed here instead of via CSS class since this is real conditional rendering, not a
  // stylesheet.
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

  const flatFolders = flattenFolderTree(folders).filter(isVisible);
  const unfiledDocs = docsInFolder(null);

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
    <div style={{ padding: '8px 8px 8px', overflowY: 'auto', fontSize: 12 }}>
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
        <button type="button" onClick={() => createFolder(null)} title="New folder" style={{ fontSize: 11 }}>
          📁+
        </button>
      </div>

      {flatFolders.map((entry) => {
        const folder = entry.folder;
        const directDocs = docsInFolder(folder.id);
        const hasChildFolder = folders.some((f) => f.parentId === folder.id);
        const isEmpty = directDocs.length === 0 && !hasChildFolder;
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
                {folder.open ? '▾' : '▸'}
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
            {folder.open && (
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
      {docsIndex.length === 0 ? (
        <div style={{ color: 'var(--hint)', padding: '4px 4px' }}>No documents yet</div>
      ) : (
        unfiledDocs.map((d) => <DocRow key={d.id} doc={d} />)
      )}
    </div>
  );
}
