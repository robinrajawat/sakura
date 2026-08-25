import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDocSyncStore } from '../store/docSyncStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * Phase 4 slice (docs/framework-migration-plan.md): account/sync, part 2 -- doc sync panel.
 * Lists the signed-in user's real documents (users/{uid}/docs), loads one into the outline
 * editor, and syncs local changes back. §6.8 slice: replaced the old manual-only "Push to
 * cloud" button with a real debounced autosave (docSyncStore.ts's own `loadDoc` now queues a
 * push automatically ~1.5s after edits settle) plus a status line matching legacy's own real
 * `updateSyncStatusUI` text states -- "Syncing…" / "Synced" / "Sync error — will retry on your
 * next change" (idle shows nothing, same as legacy's own dot going transparent). No manual
 * button anymore: legacy's own primary Firestore doc sync has never had one either, it's always
 * been purely automatic-on-edit (a separate, explicitly opt-in "Auto-sync on edit" toggle exists
 * in legacy only for its optional Gist/Drive whole-app backup feature, a different system this
 * project hasn't built at all yet -- see docSyncStore.ts's own header for what's still deferred).
 */
export function DocSyncPanel() {
  const user = useAuthStore((s) => s.user);
  const docs = useDocSyncStore((s) => s.docs);
  const docId = useDocSyncStore((s) => s.docId);
  const title = useDocSyncStore((s) => s.title);
  const loading = useDocSyncStore((s) => s.loading);
  const syncStatus = useDocSyncStore((s) => s.syncStatus);
  const error = useDocSyncStore((s) => s.error);
  const crossTabNotice = useDocSyncStore((s) => s.crossTabNotice);
  const listDocs = useDocSyncStore((s) => s.listDocs);
  const loadDoc = useDocSyncStore((s) => s.loadDoc);
  const stopWatching = useDocSyncStore((s) => s.stopWatching);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const SYNC_STATUS_TEXT: Record<typeof syncStatus, string | null> = {
    idle: null,
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Sync error — will retry on your next change'
  };
  const SYNC_STATUS_COLOR: Record<typeof syncStatus, string> = {
    idle: t.mutedText,
    syncing: t.mutedText,
    synced: '#2fa84f',
    error: '#e5484d'
  };

  useEffect(() => {
    if (user) listDocs(user.uid);
    return () => stopWatching();
    // Re-list whenever the signed-in user itself changes (a real dependency); listDocs/
    // stopWatching are stable store actions, not meaningfully "changing" between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return <div style={{ color: t.mutedText, fontSize: 13 }}>Sign in above to sync a document.</div>;
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {crossTabNotice && (
        <div style={{ background: '#fff3cd', padding: 6, borderRadius: 4, marginBottom: 6, fontSize: 12 }}>
          This document was just updated elsewhere — the outline above now reflects that change.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <select
          value={docId ?? ''}
          onChange={(e) => e.currentTarget.value && loadDoc(user.uid, e.currentTarget.value)}
          style={{ fontSize: 12 }}
        >
          <option value="">Choose a document...</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        {loading && <span style={{ color: t.mutedText }}>Loading...</span>}
        {docId && SYNC_STATUS_TEXT[syncStatus] && (
          <span style={{ color: SYNC_STATUS_COLOR[syncStatus], fontSize: 12 }}>{SYNC_STATUS_TEXT[syncStatus]}</span>
        )}
      </div>
      {docId && <div style={{ color: t.mutedText }}>Editing: {title}</div>}
      {error && <div style={{ color: '#c0392b', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
