import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computePresenceDisplay,
  filterLiveOthers,
  initPresenceState,
  startPresenceTrackingIfShared,
  stopPresenceTracking,
  isPresenceTrackingDocId,
  handlePresenceBeforeUnload,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_STALE_MS,
  type PresenceDeps,
  type PresenceUser,
  type FirestoreModLike
} from '../../src/state/presence';

describe('computePresenceDisplay (pure)', () => {
  it('is invisible with no other viewers', () => {
    expect(computePresenceDisplay([])).toEqual({ visible: false, label: '', tooltip: '' });
  });

  it('formats a single viewer', () => {
    expect(computePresenceDisplay([{ uid: 'u1', displayName: 'Alice' }])).toEqual({
      visible: true,
      label: 'Alice is here',
      tooltip: 'Alice is viewing this document'
    });
  });

  it('formats multiple viewers', () => {
    const result = computePresenceDisplay([
      { uid: 'u1', displayName: 'Alice' },
      { uid: 'u2', displayName: 'Bob' }
    ]);
    expect(result).toEqual({
      visible: true,
      label: '2 others are here',
      tooltip: 'Alice, Bob are viewing this document'
    });
  });

  it('falls back to "Someone" when displayName is missing', () => {
    expect(computePresenceDisplay([{ uid: 'u1' }])).toEqual({
      visible: true,
      label: 'Someone is here',
      tooltip: 'Someone is viewing this document'
    });
  });
});

describe('filterLiveOthers (pure)', () => {
  const rawDocs = (entries: Array<{ id: string; lastSeen?: number; displayName?: string }>) =>
    entries.map((e) => ({ id: e.id, data: () => ({ lastSeen: e.lastSeen, displayName: e.displayName }) }));

  it('excludes the caller\'s own uid', () => {
    const result = filterLiveOthers(rawDocs([{ id: 'me', lastSeen: 1000 }]), 'me', 1000, PRESENCE_STALE_MS);
    expect(result).toEqual([]);
  });

  it('excludes entries with a stale lastSeen', () => {
    const now = 100000;
    const result = filterLiveOthers(
      rawDocs([{ id: 'other', lastSeen: now - PRESENCE_STALE_MS - 1 }]),
      'me',
      now,
      PRESENCE_STALE_MS
    );
    expect(result).toEqual([]);
  });

  it('includes entries just within the staleness threshold', () => {
    const now = 100000;
    const result = filterLiveOthers(
      rawDocs([{ id: 'other', lastSeen: now - PRESENCE_STALE_MS + 1, displayName: 'Bob' }]),
      'me',
      now,
      PRESENCE_STALE_MS
    );
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('other');
  });

  it('excludes entries with a non-numeric or missing lastSeen', () => {
    const result = filterLiveOthers(rawDocs([{ id: 'other' }]), 'me', 100000, PRESENCE_STALE_MS);
    expect(result).toEqual([]);
  });
});

describe('stateful presence tracker (initPresenceState + start/stop lifecycle)', () => {
  let firestoreCalls: string[];
  let setDocCalls: Array<{ path: string[]; data: Record<string, unknown> }>;
  let deleteDocCalls: string[][];
  let snapshotCallback: ((snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null;
  let chipEl: { style: { display: string }; innerHTML: string; dataset: Record<string, string>; querySelector: (s: string) => { textContent: string } | null };
  let currentUser: PresenceUser | null;
  let sharedDocMeta: Record<string, { ownerUid: string; role: string } | undefined>;
  let docShareStatusCache: Record<string, unknown[] | undefined>;
  let fakeNow: number;

  const fakeMod: FirestoreModLike = {
    doc: (_db, ...segs) => {
      firestoreCalls.push('doc:' + segs.join('/'));
      return { __path: segs };
    },
    collection: (_db, ...segs) => {
      firestoreCalls.push('collection:' + segs.join('/'));
      return { __path: segs };
    },
    setDoc: async (ref, data) => {
      setDocCalls.push({ path: (ref as { __path: string[] }).__path, data });
    },
    deleteDoc: async (ref) => {
      deleteDocCalls.push((ref as { __path: string[] }).__path);
    },
    onSnapshot: (_query, onNext) => {
      snapshotCallback = onNext;
      return () => {
        snapshotCallback = null;
      };
    }
  };

  function makeDeps(): PresenceDeps {
    return {
      getCurrentUser: () => currentUser,
      getSharedDocMeta: (docId) => sharedDocMeta[docId],
      getDocShareStatusCache: (docId) => docShareStatusCache[docId],
      loadFirestoreMods: async () => ({ mod: fakeMod, db: {} }),
      getChipElement: () => chipEl as unknown as HTMLElement,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id),
      now: () => fakeNow
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    firestoreCalls = [];
    setDocCalls = [];
    deleteDocCalls = [];
    snapshotCallback = null;
    fakeNow = 1000000;
    currentUser = { uid: 'me-uid', displayName: 'Me', email: 'me@example.com' };
    sharedDocMeta = {};
    docShareStatusCache = {};
    const spans: Record<string, { textContent: string }> = {};
    chipEl = {
      style: { display: '' },
      innerHTML: '',
      dataset: {},
      querySelector: (sel: string) => {
        if (sel === 'span:last-child') {
          spans.last = spans.last || { textContent: '' };
          return spans.last;
        }
        return null;
      }
    };
    initPresenceState(makeDeps());
  });

  // Every test that starts tracking leaves an interval running unless it explicitly stops it
  // (most don't, since that's not what they're testing) — without cleanup, that interval keeps
  // firing into LATER tests once the fake clock is advanced there, since it's the same fake
  // timer instance's queue and the module's internal timer handle isn't test-scoped. Clearing
  // all timers, stopping tracking, and switching back to real timers after every test closes
  // that gap.
  afterEach(() => {
    try {
      stopPresenceTracking();
    } catch {
      // ignore — deps may already be in a torn-down state, nothing left to stop either way
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // Flushes pending microtasks (promise chains inside writePresenceHeartbeat/loadFirestoreMods)
  // WITHOUT advancing the fake clock — deliberately not using vi.waitFor here, which polls
  // internally in a way that interacts badly with fake timers and real setInterval together
  // (observed firing the interval far more times than the elapsed fake time should allow).
  // A handful of Promise.resolve() ticks is enough to let one `await` chain settle.
  async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  it('does nothing when there is no signed-in user', async () => {
    currentUser = null;
    startPresenceTrackingIfShared('doc1');
    expect(isPresenceTrackingDocId('doc1')).toBe(false);
    expect(setDocCalls).toHaveLength(0);
  });

  it('does nothing for a document neither shared to me nor shared by me', async () => {
    startPresenceTrackingIfShared('doc1');
    expect(isPresenceTrackingDocId('doc1')).toBe(false);
  });

  it('starts tracking a document shared TO me', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    expect(isPresenceTrackingDocId('doc1')).toBe(true);
    await flushMicrotasks();
    expect(setDocCalls).toHaveLength(1);
    expect(setDocCalls[0].path).toEqual(['users', 'owner-uid', 'docs', 'doc1', 'presence', 'me-uid']);
    expect(setDocCalls[0].data.role).toBe('editor');
  });

  it('starts tracking a document I own once its share count is known to be > 0', async () => {
    docShareStatusCache['doc2'] = [{ some: 'collaborator' }];
    startPresenceTrackingIfShared('doc2');
    expect(isPresenceTrackingDocId('doc2')).toBe(true);
    await flushMicrotasks();
    expect(setDocCalls).toHaveLength(1);
    // Owner path: presenceOwnerUidFor falls back to the current user's own uid.
    expect(setDocCalls[0].path).toEqual(['users', 'me-uid', 'docs', 'doc2', 'presence', 'me-uid']);
    expect(setDocCalls[0].data.role).toBe('owner');
  });

  it('does not re-start if already tracking the same document', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(setDocCalls).toHaveLength(1);
    startPresenceTrackingIfShared('doc1');
    // Still just the one initial heartbeat write — no redundant restart.
    expect(setDocCalls).toHaveLength(1);
  });

  it('switching to tracking a different document stops the previous one first', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    sharedDocMeta['doc2'] = { ownerUid: 'owner-uid-2', role: 'viewer' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(isPresenceTrackingDocId('doc1')).toBe(true);
    startPresenceTrackingIfShared('doc2');
    expect(isPresenceTrackingDocId('doc1')).toBe(false);
    expect(isPresenceTrackingDocId('doc2')).toBe(true);
    await flushMicrotasks();
    expect(deleteDocCalls.length).toBeGreaterThan(0);
    expect(deleteDocCalls[0]).toEqual(['users', 'owner-uid', 'docs', 'doc1', 'presence', 'me-uid']);
  });

  it('sends a heartbeat on the configured interval', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(setDocCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS);
    expect(setDocCalls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS);
    expect(setDocCalls).toHaveLength(3);
  });

  it('stopPresenceTracking clears the timer, unsubscribes, and clears own presence doc', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(snapshotCallback).not.toBeNull();
    stopPresenceTracking();
    expect(isPresenceTrackingDocId('doc1')).toBe(false);
    await flushMicrotasks();
    expect(deleteDocCalls).toHaveLength(1);
    // No further heartbeats after stopping.
    const countBefore = setDocCalls.length;
    await vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS * 2);
    expect(setDocCalls.length).toBe(countBefore);
  });

  it('updates the chip element when the snapshot listener fires with live others', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(snapshotCallback).not.toBeNull();
    snapshotCallback!({
      docs: [
        { id: 'me-uid', data: () => ({ lastSeen: fakeNow }) }, // self — must be excluded
        { id: 'other-uid', data: () => ({ displayName: 'Alice', lastSeen: fakeNow }) }
      ]
    });
    expect(chipEl.style.display).toBe('');
    expect(chipEl.dataset.tip).toBe('Alice is viewing this document');
  });

  it('hides the chip when the snapshot listener fires with no live others', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(snapshotCallback).not.toBeNull();
    snapshotCallback!({ docs: [] });
    expect(chipEl.style.display).toBe('none');
  });

  it('handlePresenceBeforeUnload clears the currently tracked document\'s presence doc', async () => {
    sharedDocMeta['doc1'] = { ownerUid: 'owner-uid', role: 'editor' };
    startPresenceTrackingIfShared('doc1');
    await flushMicrotasks();
    expect(setDocCalls).toHaveLength(1);
    handlePresenceBeforeUnload();
    await flushMicrotasks();
    expect(deleteDocCalls).toHaveLength(1);
    expect(deleteDocCalls[0]).toEqual(['users', 'owner-uid', 'docs', 'doc1', 'presence', 'me-uid']);
  });

  it('handlePresenceBeforeUnload does nothing when nothing is being tracked', () => {
    handlePresenceBeforeUnload();
    expect(deleteDocCalls).toHaveLength(0);
  });
});
