import { useEffect } from 'react';
import { useDocumentsStore } from '../store/documentsStore';
import { useOutlineStore } from '../store/outlineStore';
import { useVersionHistoryStore } from '../store/versionHistoryStore';

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
 *
 * §8.4j retrofit (docs/phase8-design-system-parity-plan.md): now renders through the real
 * `.history-modal-overlay`/`.history-modal-*`/`.history-row-*`/`.history-empty` classes
 * (index.css, cited from legacy/index.html:1396-1415) instead of inline `style` objects --
 * genuinely distinct from `.app-modal-*` despite the similar shape (own rgba/z-index, own enter
 * transition, own close-button treatment). The close button switches from the generic
 * `<CloseIcon>` svg to legacy's own real plain "×" glyph (`.history-modal-close-x`) to match this
 * family's own distinct treatment, not `.app-modal-close-btn`'s icon. Skips legacy's own `.open`
 * opacity-fade + transform-scale enter transition, same React mount/unmount precedent as
 * `.app-modal-overlay`/`#welcome-overlay`.
 */
export function VersionHistoryPanel({ onClose }: { onClose: () => void }) {
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
    <div className="history-modal-overlay" role="presentation" onClick={onClose}>
      <div className="history-modal" role="dialog" aria-label="Version History" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <span className="history-modal-title">Version History — {title}</span>
          <button type="button" className="history-modal-close-x" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>

        <div className="history-modal-body">
          {loading ? (
            <div className="history-empty">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="history-empty">
              No earlier versions yet. They're captured automatically as you edit — roughly every 10 minutes of active changes — or
              save one manually below right before a big change.
            </div>
          ) : (
            sorted.map((rev) => (
              <div key={rev.ts} className="history-row">
                <div className="history-row-info">
                  <div className="history-row-time">{new Date(rev.ts).toLocaleString()}</div>
                  <div className="history-row-meta">
                    {rev.reason} · {rev.nodes.length} node{rev.nodes.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button type="button" className="history-row-restore" onClick={() => void handleRestore(rev.ts)}>
                  Restore
                </button>
              </div>
            ))
          )}
        </div>

        <div className="history-modal-footer">
          <span className="history-modal-footer-hint">Keeps the last 20 versions per document</span>
          <button type="button" onClick={() => void handleSaveNow()}>
            Save a version now
          </button>
        </div>
      </div>
    </div>
  );
}
