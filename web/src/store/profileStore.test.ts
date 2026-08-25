import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

// §6.8 slice: mocking `firebase/firestore` at the module boundary, matching docSyncStore.test.ts/
// backupStore.test.ts's own established precedent -- exercise this store's real logic (which
// query gets built with which filters, how ensureProfile merge-writes vs. creates, how search
// dedupes/self-excludes/caps) without a real Firestore backend.
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockGetDocs = vi.fn();
let lastWhereCalls: unknown[][] = [];

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') })),
  collection: vi.fn((_db: unknown, ...segs: string[]) => ({ path: segs.join('/') })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => {
    lastWhereCalls.push(args);
    return args;
  }),
  limit: vi.fn((n: number) => ['limit', n])
}));

vi.mock('./authStore', () => ({ getFirebaseApp: vi.fn(() => ({})) }));

import { useProfileStore } from './profileStore';

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'u1',
    email: 'Ada@Example.com',
    displayName: 'Ada Lovelace',
    photoURL: 'https://example.com/a.png',
    ...overrides
  } as User;
}

describe('profileStore', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockSetDoc.mockClear();
    mockGetDocs.mockReset();
    lastWhereCalls = [];
    useProfileStore.setState({ visibility: 'private' });
  });

  describe('ensureProfile', () => {
    it('creates a new profile as private by default, lowercasing email', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });
      await useProfileStore.getState().ensureProfile(fakeUser());
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [, payload] = mockSetDoc.mock.calls[0];
      expect(payload.email).toBe('ada@example.com');
      expect(payload.displayName).toBe('Ada Lovelace');
      expect(payload.displayNameLower).toBe('ada lovelace');
      expect(payload.visibility).toBe('private');
      expect(useProfileStore.getState().visibility).toBe('private');
    });

    it('merge-writes an existing profile, preserving its current visibility rather than resetting it', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ visibility: 'public' }) });
      await useProfileStore.getState().ensureProfile(fakeUser());
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      const [, payload, opts] = mockSetDoc.mock.calls[0];
      expect(opts).toEqual({ merge: true });
      expect(payload.visibility).toBeUndefined(); // merge-write never touches visibility itself
      expect(useProfileStore.getState().visibility).toBe('public');
    });

    it('swallows a Firestore failure rather than throwing', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));
      await expect(useProfileStore.getState().ensureProfile(fakeUser())).resolves.toBeUndefined();
    });
  });

  describe('setDiscoverable', () => {
    it('optimistically flips visibility, then persists it', async () => {
      const p = useProfileStore.getState().setDiscoverable('u1', true);
      expect(useProfileStore.getState().visibility).toBe('public');
      await p;
      expect(mockSetDoc).toHaveBeenCalledWith(expect.anything(), { visibility: 'public', updatedAt: expect.any(Number) }, { merge: true });
    });

    it('rolls back the optimistic flip if the write fails', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('denied'));
      useProfileStore.setState({ visibility: 'private' });
      await useProfileStore.getState().setDiscoverable('u1', true);
      expect(useProfileStore.getState().visibility).toBe('private');
    });
  });

  describe('reset', () => {
    it('drops visibility back to private', () => {
      useProfileStore.setState({ visibility: 'public' });
      useProfileStore.getState().reset();
      expect(useProfileStore.getState().visibility).toBe('private');
    });
  });

  describe('findByEmail', () => {
    it('returns null for an empty/whitespace query without querying at all', async () => {
      expect(await useProfileStore.getState().findByEmail('   ')).toBeNull();
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('queries by exact lowercased email plus visibility=="public", capped at 1', async () => {
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [{ id: 'u2', data: () => ({ email: 'bob@example.com', displayName: 'Bob', photoURL: '' }) }]
      });
      const result = await useProfileStore.getState().findByEmail('Bob@Example.com');
      expect(result).toEqual({ uid: 'u2', email: 'bob@example.com', displayName: 'Bob', photoURL: '', visibility: 'public' });
      expect(lastWhereCalls).toContainEqual(['email', '==', 'bob@example.com']);
      expect(lastWhereCalls).toContainEqual(['visibility', '==', 'public']);
    });

    it('returns null when no public profile matches', async () => {
      mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
      expect(await useProfileStore.getState().findByEmail('nobody@example.com')).toBeNull();
    });

    it('returns null (not throw) on a Firestore failure', async () => {
      mockGetDocs.mockRejectedValue(new Error('denied'));
      expect(await useProfileStore.getState().findByEmail('a@b.com')).toBeNull();
    });
  });

  describe('search', () => {
    it('returns [] for a query shorter than 2 characters, without querying', async () => {
      expect(await useProfileStore.getState().search('a')).toEqual([]);
      expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('dedupes a profile matched by both the email and name-prefix queries', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'u2', data: () => ({ email: 'bob@example.com', displayName: 'Bob' }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'u2', data: () => ({ email: 'bob@example.com', displayName: 'Bob' }) }] });
      const results = await useProfileStore.getState().search('bob');
      expect(results).toHaveLength(1);
      expect(results[0].uid).toBe('u2');
    });

    it('excludes the given uid from results (self-exclusion for the share search box)', async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: [{ id: 'me', data: () => ({ email: 'me@example.com', displayName: 'Me' }) }] });
      const results = await useProfileStore.getState().search('me', 'me');
      expect(results).toEqual([]);
    });

    it('caps results at 8', async () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, data: () => ({ email: `u${i}@example.com`, displayName: `U${i}` }) }));
      mockGetDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: many });
      const results = await useProfileStore.getState().search('us');
      expect(results).toHaveLength(8);
    });

    it("degrades to email-only results when the name-prefix query fails (e.g. missing composite index)", async () => {
      mockGetDocs
        .mockResolvedValueOnce({ docs: [{ id: 'u2', data: () => ({ email: 'bob@example.com', displayName: 'Bob' }) }] })
        .mockRejectedValueOnce(new Error('needs an index'));
      const results = await useProfileStore.getState().search('bob');
      expect(results).toEqual([{ uid: 'u2', email: 'bob@example.com', displayName: 'Bob', photoURL: '', visibility: 'public' }]);
    });

    it('returns [] (not throw) when the whole search call itself throws unexpectedly', async () => {
      mockGetDocs.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(await useProfileStore.getState().search('bob')).toEqual([]);
    });
  });
});
