import { beforeEach, describe, expect, it, vi } from 'vitest';

// §6.8 slice: mocking `firebase/firestore` at the module boundary, matching profileStore.test.ts/
// docSyncStore.test.ts's own established precedent.
const mockGetDoc = vi.fn();
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockAddDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDocs = vi.fn();
const arrayUnionCalls: unknown[] = [];
const arrayRemoveCalls: unknown[] = [];

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') })),
  collection: vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') })),
  collectionGroup: vi.fn((_db: unknown, name: string) => ({ path: `cg:${name}` })),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  arrayUnion: vi.fn((v: unknown) => {
    arrayUnionCalls.push(v);
    return { __arrayUnion: v };
  }),
  arrayRemove: vi.fn((v: unknown) => {
    arrayRemoveCalls.push(v);
    return { __arrayRemove: v };
  }),
  deleteField: vi.fn(() => ({ __deleteField: true }))
}));

vi.mock('./authStore', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

import { useSharingStore, type SharingActor } from './sharingStore';
import type { SakuraProfile } from './profileStore';

const actor: SharingActor = { uid: 'owner1', email: 'owner@example.com', displayName: 'Owner' };
const profile: SakuraProfile = { uid: 'friend1', email: 'friend@example.com', displayName: 'Friend', photoURL: '', visibility: 'public' };

describe('sharingStore', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockUpdateDoc.mockClear();
    mockAddDoc.mockClear();
    mockGetDocs.mockReset();
    arrayUnionCalls.length = 0;
    arrayRemoveCalls.length = 0;
    useSharingStore.setState({
      collaborators: {},
      collaboratorsDocId: null,
      loadingCollaborators: false,
      sharedWithMe: null,
      loadingSharedWithMe: false
    });
  });

  describe('grantAccess', () => {
    it('refuses to share a document with your own account', async () => {
      const result = await useSharingStore.getState().grantAccess(actor, 'doc1', 'Title', { ...profile, uid: actor.uid }, 'viewer');
      expect(result).toEqual({ ok: false, error: "That's your own account." });
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('writes sharedWith.<uid> and arrayUnions sharedWithUids, then notifies the collaborator', async () => {
      const result = await useSharingStore.getState().grantAccess(actor, 'doc1', 'My Doc', profile, 'editor');
      expect(result.ok).toBe(true);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const [, payload] = mockUpdateDoc.mock.calls[0];
      expect(payload['sharedWith.friend1']).toMatchObject({ role: 'editor', email: 'friend@example.com', displayName: 'Friend' });
      expect(arrayUnionCalls).toContain('friend1');
      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      const [, notif] = mockAddDoc.mock.calls[0];
      expect(notif).toMatchObject({ type: 'share_invite', fromUid: 'owner1', docId: 'doc1', docTitle: 'My Doc', role: 'editor' });
    });

    it('updates the in-memory collaborators map only when it already matches this doc', async () => {
      useSharingStore.setState({ collaboratorsDocId: 'doc1', collaborators: {} });
      await useSharingStore.getState().grantAccess(actor, 'doc1', 'My Doc', profile, 'viewer');
      expect(useSharingStore.getState().collaborators.friend1).toBeTruthy();
    });

    it('still succeeds even if the best-effort notification write fails', async () => {
      mockAddDoc.mockRejectedValueOnce(new Error('denied'));
      const result = await useSharingStore.getState().grantAccess(actor, 'doc1', 'My Doc', profile, 'viewer');
      expect(result.ok).toBe(true);
    });

    it('returns ok:false on a Firestore write failure', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('denied'));
      const result = await useSharingStore.getState().grantAccess(actor, 'doc1', 'My Doc', profile, 'viewer');
      expect(result).toEqual({ ok: false, error: 'Could not share -- try again' });
    });
  });

  describe('revokeAccess', () => {
    it('deletes sharedWith.<uid> and arrayRemoves from sharedWithUids', async () => {
      const ok = await useSharingStore.getState().revokeAccess(actor, 'doc1', 'friend1', 'My Doc');
      expect(ok).toBe(true);
      const [, payload] = mockUpdateDoc.mock.calls[0];
      expect(payload['sharedWith.friend1']).toEqual({ __deleteField: true });
      expect(arrayRemoveCalls).toContain('friend1');
      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      const [, notif] = mockAddDoc.mock.calls[0];
      expect(notif).toMatchObject({ type: 'access_revoked' });
    });

    it('removes the entry from the in-memory collaborators map when present', async () => {
      useSharingStore.setState({ collaboratorsDocId: 'doc1', collaborators: { friend1: { role: 'viewer', email: '', displayName: '', sharedAt: 1 } } });
      await useSharingStore.getState().revokeAccess(actor, 'doc1', 'friend1', 'My Doc');
      expect(useSharingStore.getState().collaborators.friend1).toBeUndefined();
    });

    it('returns false on a Firestore write failure', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('denied'));
      expect(await useSharingStore.getState().revokeAccess(actor, 'doc1', 'friend1', 'My Doc')).toBe(false);
    });
  });

  describe('changeRole', () => {
    it('updates the dot-path role field and notifies the collaborator', async () => {
      const ok = await useSharingStore.getState().changeRole(actor, 'doc1', 'friend1', 'editor', 'My Doc');
      expect(ok).toBe(true);
      const [, payload] = mockUpdateDoc.mock.calls[0];
      expect(payload['sharedWith.friend1.role']).toBe('editor');
      const [, notif] = mockAddDoc.mock.calls[0];
      expect(notif).toMatchObject({ type: 'access_role_changed', role: 'editor' });
    });

    it('updates the in-memory entry role when present', async () => {
      useSharingStore.setState({
        collaboratorsDocId: 'doc1',
        collaborators: { friend1: { role: 'viewer', email: 'friend@example.com', displayName: 'Friend', sharedAt: 1 } }
      });
      await useSharingStore.getState().changeRole(actor, 'doc1', 'friend1', 'editor', 'My Doc');
      expect(useSharingStore.getState().collaborators.friend1.role).toBe('editor');
    });

    it('returns false on a Firestore write failure', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('denied'));
      expect(await useSharingStore.getState().changeRole(actor, 'doc1', 'friend1', 'editor', 'My Doc')).toBe(false);
    });
  });

  describe('loadCollaborators', () => {
    it('reads sharedWith off the owner doc', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ sharedWith: { friend1: { role: 'viewer', email: 'friend@example.com', displayName: 'Friend', sharedAt: 1 } } })
      });
      await useSharingStore.getState().loadCollaborators('owner1', 'doc1');
      expect(useSharingStore.getState().collaborators.friend1.role).toBe('viewer');
      expect(useSharingStore.getState().collaboratorsDocId).toBe('doc1');
      expect(useSharingStore.getState().loadingCollaborators).toBe(false);
    });

    it('defaults to {} when the doc has no sharedWith field', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
      await useSharingStore.getState().loadCollaborators('owner1', 'doc1');
      expect(useSharingStore.getState().collaborators).toEqual({});
      // No collaborators -- the self-healing sharedWithUids backfill never fires.
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('fails safe to {} on a Firestore error', async () => {
      mockGetDoc.mockRejectedValue(new Error('denied'));
      await useSharingStore.getState().loadCollaborators('owner1', 'doc1');
      expect(useSharingStore.getState().collaborators).toEqual({});
      expect(useSharingStore.getState().loadingCollaborators).toBe(false);
    });
  });

  describe('loadSharedWithMe', () => {
    it('resolves each shared doc plus its owner identity via collectionGroup + array-contains', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'doc1',
            ref: { parent: { parent: { id: 'owner1' } } },
            data: () => ({ title: 'Shared Doc', sharedWith: { me1: { role: 'editor', sharedAt: 500 } } })
          }
        ]
      });
      mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ displayName: 'Owner', email: 'owner@example.com' }) });

      await useSharingStore.getState().loadSharedWithMe('me1');

      const items = useSharingStore.getState().sharedWithMe;
      expect(items).toEqual([
        { docId: 'doc1', ownerUid: 'owner1', title: 'Shared Doc', role: 'editor', sharedAt: 500, ownerDisplayName: 'Owner', ownerEmail: 'owner@example.com' }
      ]);
    });

    it('is idempotent -- a second call without force does not re-query', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] });
      await useSharingStore.getState().loadSharedWithMe('me1');
      await useSharingStore.getState().loadSharedWithMe('me1');
      expect(mockGetDocs).toHaveBeenCalledTimes(1);
    });

    it('force:true re-queries even when already loaded', async () => {
      mockGetDocs.mockResolvedValue({ docs: [] });
      await useSharingStore.getState().loadSharedWithMe('me1');
      await useSharingStore.getState().loadSharedWithMe('me1', true);
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
    });

    it('fails safe to [] on a Firestore error (e.g. missing collection-group index)', async () => {
      mockGetDocs.mockRejectedValue(new Error('needs an index'));
      await useSharingStore.getState().loadSharedWithMe('me1');
      expect(useSharingStore.getState().sharedWithMe).toEqual([]);
      expect(useSharingStore.getState().loadingSharedWithMe).toBe(false);
    });

    it('shows a blank owner identity when the owner profile lookup fails or is private/missing', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'doc1',
            ref: { parent: { parent: { id: 'owner1' } } },
            data: () => ({ title: 'Shared Doc', sharedWith: {} })
          }
        ]
      });
      mockGetDoc.mockRejectedValueOnce(new Error('denied'));
      await useSharingStore.getState().loadSharedWithMe('me1');
      const items = useSharingStore.getState().sharedWithMe!;
      expect(items[0].ownerDisplayName).toBe('');
      expect(items[0].ownerEmail).toBe('');
      expect(items[0].role).toBe('viewer'); // default when this uid's own sharedWith entry is missing
    });
  });
});
