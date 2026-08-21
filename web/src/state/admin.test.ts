import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFeedbackAdmin,
  isAdminNow,
  initAdminState,
  refreshAdminStatus,
  updateFeedbackAdminUI,
  type AdminDeps,
  type AdminFirestoreModLike
} from './admin';

const ADMIN_EMAIL = 'robinsinghrajawat@gmail.com';

describe('isFeedbackAdmin (pure)', () => {
  it('is true for the hardcoded admin email, case-insensitively', () => {
    expect(isFeedbackAdmin({ uid: 'u1', email: ADMIN_EMAIL })).toBe(true);
    expect(isFeedbackAdmin({ uid: 'u1', email: ADMIN_EMAIL.toUpperCase() })).toBe(true);
  });

  it('is false for any other email', () => {
    expect(isFeedbackAdmin({ uid: 'u1', email: 'someone-else@example.com' })).toBe(false);
  });

  it('is false for a null user or a user with no email', () => {
    expect(isFeedbackAdmin(null)).toBe(false);
    expect(isFeedbackAdmin({ uid: 'u1' })).toBe(false);
    expect(isFeedbackAdmin({ uid: 'u1', email: null })).toBe(false);
  });
});

describe('stateful admin status (initAdminState + refreshAdminStatus)', () => {
  let getDocCalls: string[][];
  let collectionAdminResults: Record<string, boolean>;
  let collectionAdminShouldThrow: boolean;
  let sectionEl: { style: { display: string }; dataset: Record<string, string> };
  let closeFeedbackInboxModalCalls: number;

  const fakeMod: AdminFirestoreModLike = {
    doc: (_db, ...segs) => ({ __path: segs }),
    getDoc: async (ref) => {
      const path = (ref as { __path: string[] }).__path;
      getDocCalls.push(path);
      if (collectionAdminShouldThrow) throw new Error('firestore down');
      const uid = path[path.length - 1];
      return { exists: () => !!collectionAdminResults[uid] };
    }
  };

  function makeDeps(): AdminDeps {
    return {
      loadFirestoreMods: async () => ({ mod: fakeMod, db: {} }),
      getAdminSectionElement: () => sectionEl as unknown as HTMLElement,
      closeFeedbackInboxModal: () => {
        closeFeedbackInboxModalCalls++;
      }
    };
  }

  beforeEach(() => {
    getDocCalls = [];
    collectionAdminResults = {};
    collectionAdminShouldThrow = false;
    sectionEl = { style: { display: '' }, dataset: {} };
    closeFeedbackInboxModalCalls = 0;
    initAdminState(makeDeps());
  });

  async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  it('starts as not-admin', () => {
    expect(isAdminNow()).toBe(false);
  });

  it('grants access immediately for the hardcoded admin email, before the Firestore check resolves', () => {
    refreshAdminStatus({ uid: 'u1', email: ADMIN_EMAIL });
    expect(isAdminNow()).toBe(true);
    expect(sectionEl.style.display).toBe('');
    expect(sectionEl.dataset.featureHidden).toBe('');
  });

  it('starts non-admin and hides the section for a non-admin, non-matching user, until the Firestore check resolves true', async () => {
    collectionAdminResults['u2'] = true;
    refreshAdminStatus({ uid: 'u2', email: 'someone@example.com' });
    expect(isAdminNow()).toBe(false);
    expect(sectionEl.style.display).toBe('none');
    expect(sectionEl.dataset.featureHidden).toBe('1');
    expect(closeFeedbackInboxModalCalls).toBe(1);

    await flushMicrotasks();
    expect(getDocCalls).toEqual([['admins', 'u2']]);
    expect(isAdminNow()).toBe(true);
    expect(sectionEl.style.display).toBe('');
  });

  it('never flips true when the Firestore admins doc does not exist', async () => {
    collectionAdminResults['u3'] = false;
    refreshAdminStatus({ uid: 'u3', email: 'someone@example.com' });
    await flushMicrotasks();
    expect(isAdminNow()).toBe(false);
  });

  it('never flips true when the Firestore check throws', async () => {
    collectionAdminShouldThrow = true;
    refreshAdminStatus({ uid: 'u4', email: 'someone@example.com' });
    await flushMicrotasks();
    expect(isAdminNow()).toBe(false);
  });

  it('does nothing async when there is no signed-in user', async () => {
    refreshAdminStatus(null);
    expect(isAdminNow()).toBe(false);
    await flushMicrotasks();
    expect(getDocCalls).toHaveLength(0);
  });

  it('discards a stale (superseded) async result via the token guard, even when that stale result is true', async () => {
    // stale-user's Firestore check WOULD grant admin if it were wrongly applied; fresh-user's
    // would not. If the token guard works, only fresh-user's (false) result can take effect —
    // proving the true stale result was actually discarded, not just coincidentally harmless.
    collectionAdminResults['stale-user'] = true;
    collectionAdminResults['fresh-user'] = false;
    refreshAdminStatus({ uid: 'stale-user', email: 'x@example.com' }); // first check in flight
    refreshAdminStatus({ uid: 'fresh-user', email: 'y@example.com' }); // supersedes it
    await flushMicrotasks();
    expect(getDocCalls).toEqual([
      ['admins', 'stale-user'],
      ['admins', 'fresh-user']
    ]);
    expect(isAdminNow()).toBe(false);
  });

  it('updateFeedbackAdminUI can be called directly and reflects current isAdmin state', () => {
    updateFeedbackAdminUI();
    expect(sectionEl.style.display).toBe('none');
    expect(closeFeedbackInboxModalCalls).toBe(1);
  });

  it('does nothing to the DOM when the admin section element is absent', () => {
    initAdminState({ ...makeDeps(), getAdminSectionElement: () => null });
    expect(() => refreshAdminStatus({ uid: 'u1', email: ADMIN_EMAIL })).not.toThrow();
  });
});
