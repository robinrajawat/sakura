import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useDocSyncStore } from '../store/docSyncStore';
import { useSharingStore, type SharingActor } from '../store/sharingStore';
import { useProfileStore, type SakuraProfile } from '../store/profileStore';
import { SharedDocBanner } from './SharedDocBanner';
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
 *
 * §6.8 slice (sharing): added the Share dialog (search-as-you-type by name/email via
 * `profileStore.search`, click a result to grant access at the currently selected role) plus a
 * collaborator list with per-row role change/revoke -- both visible only when the loaded
 * document is owned by the signed-in account (`role === 'owner'`; a document opened via "Shared
 * with me" has no Share UI of its own, matching legacy's real "only the owner can manage
 * sharing" rule, enforced here client-side and, for real, by Firestore security rules). Also
 * added the "Shared with me" list (`sharingStore.loadSharedWithMe`) -- deliberately placed in
 * this same panel rather than the sidebar the way legacy puts it, a real, documented
 * simplification (`web/`'s sidebar is file-explorer-shaped, not yet a place for a second,
 * unrelated list); its "Open" action calls `docSyncStore.loadDoc(ownerUid, docId, {role,
 * ownerDisplayName, ownerEmail})`, reusing the exact same load path an owned document uses.
 * `SharedDocBanner` (its own component) shows above the outline whenever the loaded doc isn't
 * this account's own.
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
  const role = useDocSyncStore((s) => s.role);
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

  const collaborators = useSharingStore((s) => s.collaborators);
  const collaboratorsDocId = useSharingStore((s) => s.collaboratorsDocId);
  const loadingCollaborators = useSharingStore((s) => s.loadingCollaborators);
  const loadCollaborators = useSharingStore((s) => s.loadCollaborators);
  const grantAccess = useSharingStore((s) => s.grantAccess);
  const revokeAccess = useSharingStore((s) => s.revokeAccess);
  const changeRole = useSharingStore((s) => s.changeRole);
  const sharedWithMe = useSharingStore((s) => s.sharedWithMe);
  const loadingSharedWithMe = useSharingStore((s) => s.loadingSharedWithMe);
  const loadSharedWithMe = useSharingStore((s) => s.loadSharedWithMe);
  const search = useProfileStore((s) => s.search);

  const [shareQuery, setShareQuery] = useState('');
  const [shareResults, setShareResults] = useState<SakuraProfile[]>([]);
  const [shareSearching, setShareSearching] = useState(false);
  const [shareRole, setShareRole] = useState<'viewer' | 'editor'>('viewer');
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (user) listDocs(user.uid);
    return () => stopWatching();
    // Re-list whenever the signed-in user itself changes (a real dependency); listDocs/
    // stopWatching are stable store actions, not meaningfully "changing" between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) void loadSharedWithMe(user.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user && docId && role === 'owner') void loadCollaborators(user.uid, docId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, docId, role]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const clean = shareQuery.trim();
    if (clean.length < 2 || !user) {
      setShareResults([]);
      setShareSearching(false);
      return;
    }
    setShareSearching(true);
    searchTimerRef.current = setTimeout(() => {
      void search(clean, user.uid).then((results) => {
        setShareResults(results);
        setShareSearching(false);
      });
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareQuery, user]);

  if (!user) {
    return <div style={{ color: t.mutedText, fontSize: 13 }}>Sign in above to sync a document.</div>;
  }

  const actor: SharingActor = { uid: user.uid, email: user.email || '', displayName: user.displayName || '' };

  async function handleShareWith(profile: SakuraProfile) {
    if (!docId) return;
    setShareMessage(null);
    const result = await grantAccess(actor, docId, title, profile, shareRole);
    if (result.ok) {
      setShareMessage(`Shared with ${profile.displayName || profile.email}`);
      setShareQuery('');
      setShareResults([]);
    } else {
      setShareMessage(result.error);
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', fontSize: 13 }}>
      {crossTabNotice && (
        <div style={{ background: '#fff3cd', padding: 6, borderRadius: 4, marginBottom: 6, fontSize: 12 }}>
          This document was just updated elsewhere — the outline above now reflects that change.
        </div>
      )}
      {docId && <SharedDocBanner t={t} />}
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

      {docId && role === 'owner' && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Share this document</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={shareQuery}
              onChange={(e) => setShareQuery(e.currentTarget.value)}
              style={{ fontSize: 12, flex: 1 }}
            />
            <select value={shareRole} onChange={(e) => setShareRole(e.currentTarget.value as 'viewer' | 'editor')} style={{ fontSize: 12 }}>
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
          </div>
          {shareSearching && <div style={{ color: t.mutedText, fontSize: 11, marginTop: 2 }}>Searching...</div>}
          {shareResults.length > 0 && (
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 4, marginTop: 4, maxHeight: 140, overflowY: 'auto' }}>
              {shareResults.map((p) => (
                <div
                  key={p.uid}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleShareWith(p)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') void handleShareWith(p);
                  }}
                  style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
                >
                  {p.displayName || p.email} {p.displayName && <span style={{ color: t.mutedText }}>({p.email})</span>}
                </div>
              ))}
            </div>
          )}
          {shareQuery.trim().length >= 2 && !shareSearching && shareResults.length === 0 && (
            <div style={{ color: t.mutedText, fontSize: 11, marginTop: 2 }}>No discoverable accounts match.</div>
          )}
          {shareMessage && <div style={{ fontSize: 11, marginTop: 4, color: t.mutedText }}>{shareMessage}</div>}

          <div style={{ marginTop: 8 }}>
            {loadingCollaborators ? (
              <div style={{ color: t.mutedText, fontSize: 12 }}>Loading collaborators...</div>
            ) : collaboratorsDocId === docId && Object.keys(collaborators).length > 0 ? (
              <div style={{ display: 'grid', gap: 4 }}>
                {Object.entries(collaborators).map(([uid, entry]) => (
                  <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ flex: 1 }}>{entry.displayName || entry.email}</span>
                    <select
                      value={entry.role}
                      onChange={(e) => void changeRole(actor, docId, uid, e.currentTarget.value as 'viewer' | 'editor', title)}
                      style={{ fontSize: 11 }}
                    >
                      <option value="viewer">Can view</option>
                      <option value="editor">Can edit</option>
                    </select>
                    <button type="button" onClick={() => void revokeAccess(actor, docId, uid, title)} style={{ fontSize: 11 }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: t.mutedText, fontSize: 12 }}>Not shared with anyone yet.</div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, borderTop: `1px solid ${t.border}`, paddingTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Shared with me</div>
        {loadingSharedWithMe ? (
          <div style={{ color: t.mutedText, fontSize: 12 }}>Loading...</div>
        ) : sharedWithMe && sharedWithMe.length > 0 ? (
          <div style={{ display: 'grid', gap: 4 }}>
            {sharedWithMe.map((item) => (
              <div key={`${item.ownerUid}/${item.docId}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ flex: 1 }}>
                  {item.title} <span style={{ color: t.mutedText }}>-- from {item.ownerDisplayName || item.ownerEmail || 'someone'}</span>
                </span>
                <span style={{ color: t.mutedText, fontSize: 11 }}>{item.role === 'editor' ? 'can edit' : 'view only'}</span>
                <button
                  type="button"
                  onClick={() =>
                    loadDoc(item.ownerUid, item.docId, { role: item.role, ownerDisplayName: item.ownerDisplayName, ownerEmail: item.ownerEmail })
                  }
                  style={{ fontSize: 11 }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: t.mutedText, fontSize: 12 }}>No documents have been shared with you.</div>
        )}
      </div>
    </div>
  );
}
