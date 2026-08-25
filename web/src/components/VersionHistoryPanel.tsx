import { useEffect } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useOutlineStore } from '../store/outlineStore';
import { useVersionHistoryStore } from '../store/versionHistoryStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * §6.8 slice: Version History panel for the active document -- direct port of legacy's real
 * `#history-modal-overlay` (legacy/index.html:7797, `renderVersionHistoryList`,
 * legacy/index.html:10971-11036), scoped to this slice's own real limits (see
 * `versionHistoryStore.ts`'s own header): outline nodes/title only, active document only, no
 * per-node view. `web/` has no generic modal system (same established precedent
 * `RestructureTextDialog.tsx` already used), so this is its own small, purpose-built overlay.
 *
 * "Restore" uses `window.confirm` (this project's established native-primitive convention) with
 * a close paraphrase of legacy's real wording -- restoring is never itself destructive (the
 * current content is snapshotted as a fresh `'Before restoring an older version'` revision
 * first, `documentsStore.ts`'s own `restoreDocRevision`), so the confirm text says so.
 */
export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const title = useDocumentsStore((s) => s.docsIndex.find((d) => d.id === s.activeDocId)?.title ?? 'Untitled');
  const revisions = useVersionHistoryStore((s) => s.revisions);
  const loading = useVersionHistoryStore((s) => s.loading);
  const loadRevisions = useVersionHistoryStore((s) => s.loadRevisions);
  const recordRevision = useVersionHistoryStore((s) => s.recordRevision);
  const restoreDocRevision = useDocumentsStore((s) => s.restoreDocRevision);

  useEffect(() => {
    if (activeDocId) void loadRevisions(activeDocId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId]);

  if (!activeDocId) return null;

  async function handleSaveNow() {
    if (!activeDocId) return;
    await recordRevision(activeDocId, useOutlineStore.getState().nodes, title, 'Manual checkpoint');
  }

  async function handleRestore(ts: number) {
    if (!activeDocId) return;
    if (!window.confirm('Replace the current content with this earlier version?\n\nThis is never destructive -- what\'s here now is saved as its own version first, so you can always come back to it.')) {
      return;
    }
    await restoreDocRevision(activeDocId, ts);
  }

  const sorted = [...revisions].sort((a, b) => b.ts - a.ts);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Version History"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.background,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          width: 480,
          maxWidth: '92vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,.25)',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Version History -- {title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" style={{ fontSize: 11 }}>
            ✕
          </button>
        </div>
        <p style={{ fontSize: 11, color: t.mutedText, margin: '0 0 10px' }}>Keeps the last 20 versions per document.</p>

        <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 6 }}>
          {loading ? (
            <div style={{ color: t.mutedText, fontSize: 12 }}>Loading...</div>
          ) : sorted.length === 0 ? (
            <div style={{ color: t.mutedText, fontSize: 12 }}>
              No earlier versions yet. They're captured automatically as you edit -- roughly every 10 minutes of active changes -- or
              save one manually below right before a big change.
            </div>
          ) : (
            sorted.map((rev) => (
              <div
                key={rev.ts}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}
              >
                <div style={{ flex: 1 }}>
                  <div>{new Date(rev.ts).toLocaleString()}</div>
                  <div style={{ color: t.mutedText, fontSize: 11 }}>
                    {rev.reason} · {rev.nodes.length} node{rev.nodes.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button type="button" onClick={() => void handleRestore(rev.ts)}>
                  Restore
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => void handleSaveNow()}>
            Save a version now
          </button>
        </div>
      </div>
    </div>
  );
}
