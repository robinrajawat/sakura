import { useEffect, useState } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 5 slice (docs/framework-migration-plan.md): Documents & Tabs, part 2 -- the UI. A tab
 * strip (double-click to rename, X to close) plus a document picker dropdown listing every
 * document that exists (not just open ones), matching README's own "clicking a document in the
 * file explorer... opens it as a tab" and "the X icon closes the tab only" behavior. No
 * searchable tab-switcher dropdown for overflow, no drag-to-reorder tabs, no folders -- each a
 * real, separately-scoped follow-up (documentsStore.ts's own header has the fuller list).
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
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    init();
    // init() only needs to run once per app lifetime (it restores persisted state) -- same
    // deliberate empty-dependency-array convention as AuthPanel.tsx's own init() effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function titleFor(id: string): string {
    return docsIndex.find((d) => d.id === id)?.title ?? 'Untitled';
  }

  const closedDocs = docsIndex.filter((d) => !openTabs.includes(d.id));

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {openTabs.map((id) => (
          <div
            key={id}
            onClick={() => switchTab(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              background: id === activeDocId ? t.selectedBg : 'transparent',
              border: `1px solid ${t.border}`
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
        ))}
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
