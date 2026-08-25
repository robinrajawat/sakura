import { create } from 'zustand';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
  type Firestore
} from 'firebase/firestore';
import { getFirebaseApp } from './authStore';
import type { SakuraProfile } from './profileStore';

/** The minimal identity `grantAccess`/`revokeAccess`/`changeRole` need for the notification they
 * write (`fromUid`/`fromEmail`/`fromDisplayName`) and the self-share guard -- passed explicitly
 * by the caller (already has `useAuthStore`'s `user`) rather than this store reaching into
 * `firebase/auth` itself, matching `docSyncStore.ts`'s own established "the caller already knows
 * who's signed in, pass it in" convention (its `uid` params) rather than a second, redundant way
 * to ask "who's the current user" from inside a store that isn't `authStore` itself. */
export interface SharingActor {
  uid: string;
  email: string;
  displayName: string;
}

/**
 * §6.8 slice: document sharing -- direct port of legacy's real sharing machinery
 * (legacy/index.html:14244-14486). `sharedWith` lives directly on the Firestore doc at
 * `users/{ownerUid}/docs/{docId}`, keyed by collaborator uid, each entry holding
 * `{role,email,displayName,sharedAt}` (not a bare role string) specifically so "who has access"
 * still shows even if that person's own profile has since gone private. `sharedWithUids` (a
 * plain array, kept in sync alongside `sharedWith`) exists ONLY to make `loadSharedWithMe`'s
 * collectionGroup query indexable -- Firestore indexes a collectionGroup query by its exact
 * literal field path, so a dynamic path like `sharedWith.<uid>.role` could never scale past one
 * hardcoded uid; a single `array-contains` index on the static field name `sharedWithUids`
 * covers every account, forever, the same way any other collectionGroup index does. Grant/
 * revoke/role-change each write a notification into the collaborator's own
 * `notifications/{uid}/items` (best-effort -- the access change itself already succeeded
 * regardless of whether the notification write does), which `notificationsStore.ts` surfaces.
 *
 * `loadSharedWithMe` needs its own one-time Firebase Console setup (a collection-group index on
 * `sharedWithUids`) that this project has no way to verify is actually provisioned in the real
 * production project -- flagged explicitly to the user before this slice was built. It fails
 * safely either way: a missing index surfaces as a caught, logged error and an empty list, not a
 * crash, matching legacy's own real `findDocsSharedWithMe` behavior exactly (including its own
 * console warning pointing at the direct "create this index" link Firestore itself prints).
 */

export interface SharedWithEntry {
  role: 'viewer' | 'editor';
  email: string;
  displayName: string;
  sharedAt: number;
}

export interface SharedWithMeItem {
  docId: string;
  ownerUid: string;
  title: string;
  role: 'viewer' | 'editor';
  sharedAt: number;
  ownerDisplayName: string;
  ownerEmail: string;
}

function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

interface SharingState {
  collaborators: Record<string, SharedWithEntry>;
  collaboratorsDocId: string | null;
  loadingCollaborators: boolean;
  sharedWithMe: SharedWithMeItem[] | null;
  loadingSharedWithMe: boolean;

  loadCollaborators: (ownerUid: string, docId: string) => Promise<void>;
  grantAccess: (
    actor: SharingActor,
    docId: string,
    docTitle: string,
    profile: SakuraProfile,
    role: 'viewer' | 'editor'
  ) => Promise<{ ok: true; entry: SharedWithEntry } | { ok: false; error: string }>;
  revokeAccess: (actor: SharingActor, docId: string, uid: string, docTitle: string) => Promise<boolean>;
  changeRole: (actor: SharingActor, docId: string, uid: string, role: 'viewer' | 'editor', docTitle: string) => Promise<boolean>;
  loadSharedWithMe: (currentUid: string, force?: boolean) => Promise<void>;
}

async function notifyCollaborator(
  uid: string,
  type: 'share_invite' | 'access_revoked' | 'access_role_changed',
  fromUid: string,
  fromEmail: string,
  fromDisplayName: string,
  docId: string,
  docTitle: string,
  role?: 'viewer' | 'editor'
): Promise<void> {
  try {
    await addDoc(collection(getDb(), 'notifications', uid, 'items'), {
      type,
      fromUid,
      fromEmail,
      fromDisplayName,
      docId,
      docTitle: docTitle || 'Untitled',
      ...(role ? { role } : {}),
      createdAt: Date.now(),
      read: false
    });
  } catch (err) {
    console.warn(`[sakura] ${type} notification failed (the access change itself still succeeded):`, err);
  }
}

export const useSharingStore = create<SharingState>((set, get) => ({
  collaborators: {},
  collaboratorsDocId: null,
  loadingCollaborators: false,
  sharedWithMe: null,
  loadingSharedWithMe: false,

  loadCollaborators: async (ownerUid, docId) => {
    set({ loadingCollaborators: true });
    try {
      const snap = await getDoc(doc(getDb(), 'users', ownerUid, 'docs', docId));
      const shared = (snap.exists() && typeof snap.data().sharedWith === 'object' && snap.data().sharedWith) || {};
      set({ collaborators: shared, collaboratorsDocId: docId, loadingCollaborators: false });
      // Self-healing backfill for a document shared before `sharedWithUids` existed on it (a
      // document created and shared entirely within `web/` always has it from the start; this
      // only matters for a document whose sharing history predates this field, e.g. one shared
      // from legacy before this project's own equivalent existed) -- safe and cheap since it's
      // idempotent and only fires when there's actually at least one collaborator to backfill.
      const uids = Object.keys(shared);
      if (uids.length) {
        try {
          await updateDoc(doc(getDb(), 'users', ownerUid, 'docs', docId), { sharedWithUids: uids });
        } catch (err) {
          console.warn('[sakura] sharedWithUids backfill failed:', err);
        }
      }
    } catch (err) {
      console.warn('[sakura] loadCollaborators failed:', err);
      set({ collaborators: {}, collaboratorsDocId: docId, loadingCollaborators: false });
    }
  },

  grantAccess: async (actor, docId, docTitle, profile, role) => {
    if (profile.uid === actor.uid) return { ok: false, error: "That's your own account." };
    try {
      const ref = doc(getDb(), 'users', actor.uid, 'docs', docId);
      const entry: SharedWithEntry = { role, email: profile.email || '', displayName: profile.displayName || '', sharedAt: Date.now() };
      await updateDoc(ref, { [`sharedWith.${profile.uid}`]: entry, sharedWithUids: arrayUnion(profile.uid) });
      await notifyCollaborator(profile.uid, 'share_invite', actor.uid, actor.email.toLowerCase(), actor.displayName, docId, docTitle, role);
      set((s) => (s.collaboratorsDocId === docId ? { collaborators: { ...s.collaborators, [profile.uid]: entry } } : {}));
      return { ok: true, entry };
    } catch (err) {
      console.warn('[sakura] grantAccess failed:', err);
      return { ok: false, error: 'Could not share -- try again' };
    }
  },

  revokeAccess: async (actor, docId, uid, docTitle) => {
    try {
      await updateDoc(doc(getDb(), 'users', actor.uid, 'docs', docId), {
        [`sharedWith.${uid}`]: deleteField(),
        sharedWithUids: arrayRemove(uid)
      });
      await notifyCollaborator(uid, 'access_revoked', actor.uid, actor.email.toLowerCase(), actor.displayName, docId, docTitle);
      set((s) => {
        if (s.collaboratorsDocId !== docId) return {};
        const next = { ...s.collaborators };
        delete next[uid];
        return { collaborators: next };
      });
      return true;
    } catch (err) {
      console.warn('[sakura] revokeAccess failed:', err);
      return false;
    }
  },

  changeRole: async (actor, docId, uid, role, docTitle) => {
    try {
      await updateDoc(doc(getDb(), 'users', actor.uid, 'docs', docId), { [`sharedWith.${uid}.role`]: role });
      await notifyCollaborator(uid, 'access_role_changed', actor.uid, actor.email.toLowerCase(), actor.displayName, docId, docTitle, role);
      set((s) => {
        if (s.collaboratorsDocId !== docId || !s.collaborators[uid]) return {};
        return { collaborators: { ...s.collaborators, [uid]: { ...s.collaborators[uid], role } } };
      });
      return true;
    } catch (err) {
      console.warn('[sakura] changeRole failed:', err);
      return false;
    }
  },

  loadSharedWithMe: async (currentUid, force) => {
    if (get().sharedWithMe !== null && !force) return;
    set({ loadingSharedWithMe: true });
    try {
      const q = query(collectionGroup(getDb(), 'docs'), where('sharedWithUids', 'array-contains', currentUid));
      const snap = await getDocs(q);
      const items: SharedWithMeItem[] = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data();
          const ownerUid = d.ref.parent.parent?.id ?? '';
          const mySharedEntry = (data.sharedWith || {})[currentUid] || {};
          let ownerDisplayName = '';
          let ownerEmail = '';
          try {
            const ownerSnap = await getDoc(doc(getDb(), 'profiles', ownerUid));
            if (ownerSnap.exists()) {
              ownerDisplayName = ownerSnap.data().displayName || '';
              ownerEmail = ownerSnap.data().email || '';
            }
          } catch {
            // best-effort -- a private/missing owner profile just shows as "Someone" below
          }
          return {
            docId: d.id,
            ownerUid,
            title: data.title || 'Untitled',
            role: mySharedEntry.role || 'viewer',
            sharedAt: mySharedEntry.sharedAt || 0,
            ownerDisplayName,
            ownerEmail
          };
        })
      );
      items.sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));
      set({ sharedWithMe: items, loadingSharedWithMe: false });
    } catch (err) {
      console.warn(
        '[sakura] loadSharedWithMe failed -- likely needs a collection-group index on "sharedWithUids" (array-contains), see Firebase Console -> Firestore -> Indexes, or the direct link Firestore prints above this warning:',
        err
      );
      set({ sharedWithMe: [], loadingSharedWithMe: false });
    }
  }
}));
