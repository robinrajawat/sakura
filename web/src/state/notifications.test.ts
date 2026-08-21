import { describe, it, expect, beforeEach } from 'vitest';
import {
  notifText,
  combinedNotifItems,
  initNotificationsState,
  bootLocalNotifications,
  pushLocalNotification,
  startNotificationsListener,
  stopNotificationsListener,
  markNotificationRead,
  deleteNotification,
  clearAllNotifications,
  toggleNotifMenu,
  isNotifMenuOpen,
  type NotifDeps,
  type NotifFirestoreModLike,
  type LocalStorageLike
} from './notifications';

describe('notifText (pure)', () => {
  it('formats a share invite with a display name and role', () => {
    expect(notifText({ id: '1', type: 'share_invite', fromDisplayName: 'Alice', docTitle: 'Roadmap', role: 'editor' })).toBe(
      'Alice shared "Roadmap" with you (edit access)'
    );
  });

  it('falls back to email, then "Someone", for a share invite', () => {
    expect(notifText({ id: '1', type: 'share_invite', fromEmail: 'a@example.com', docTitle: 'Doc', role: 'viewer' })).toBe(
      'a@example.com shared "Doc" with you (view access)'
    );
    expect(notifText({ id: '1', type: 'share_invite', docTitle: 'Doc', role: 'viewer' })).toBe(
      'Someone shared "Doc" with you (view access)'
    );
  });

  it('formats access_revoked', () => {
    expect(notifText({ id: '1', type: 'access_revoked', fromDisplayName: 'Bob', docTitle: 'Plan' })).toBe(
      'Bob removed your access to "Plan"'
    );
  });

  it('formats access_role_changed for both roles', () => {
    expect(notifText({ id: '1', type: 'access_role_changed', fromDisplayName: 'Bob', docTitle: 'Plan', role: 'editor' })).toBe(
      'Bob gave you edit access to "Plan"'
    );
    expect(notifText({ id: '1', type: 'access_role_changed', fromDisplayName: 'Bob', docTitle: 'Plan', role: 'viewer' })).toBe(
      'Bob gave you view-only access to "Plan"'
    );
  });

  it('falls back to the message field, then a generic string, for unknown types', () => {
    expect(notifText({ id: '1', message: 'Custom text' })).toBe('Custom text');
    expect(notifText({ id: '1' })).toBe('New notification');
  });
});

describe('stateful notifications (initNotificationsState + lifecycle)', () => {
  let updateDocCalls: Array<{ path: string[]; data: Record<string, unknown> }>;
  let deleteDocCalls: string[][];
  let snapshotCallback: ((snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void) | null;
  let currentUser: { uid: string } | null;
  let fakeNow: number;
  let randomIdCounter: number;
  let storageData: Record<string, string>;
  let badgeEl: { style: { display: string }; textContent: string };
  let menuEl: { _open: boolean; classList: { contains: (c: string) => boolean; toggle: (c: string, force?: boolean) => boolean } };
  let toggleEl: { attrs: Record<string, string>; setAttribute: (n: string, v: string) => void };
  let renderNotifListCalls: number;
  let toastMessages: string[];

  const fakeStorage: LocalStorageLike = {
    getItem: (key) => (key in storageData ? storageData[key] : null),
    setItem: (key, value) => {
      storageData[key] = value;
    }
  };

  const fakeMod: NotifFirestoreModLike = {
    doc: (_db, ...segs) => ({ __path: segs }),
    collection: (_db, ...segs) => ({ __path: segs }),
    query: (...args) => ({ __query: args }),
    orderBy: (field, dir) => ({ __orderBy: [field, dir] }),
    limit: (n) => ({ __limit: n }),
    updateDoc: async (ref, data) => {
      updateDocCalls.push({ path: (ref as { __path: string[] }).__path, data });
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

  function makeDeps(): NotifDeps {
    return {
      getCurrentUser: () => currentUser,
      loadFirestoreMods: async () => ({ mod: fakeMod, db: {} }),
      getLocalStorage: () => fakeStorage,
      getBadgeElement: () => badgeEl as unknown as HTMLElement,
      getMenuElement: () => menuEl as unknown as HTMLElement,
      getToggleElement: () => toggleEl as unknown as HTMLElement,
      showToast: (msg) => toastMessages.push(msg),
      renderNotifList: () => {
        renderNotifListCalls++;
      },
      now: () => fakeNow,
      randomId: () => 'rid' + randomIdCounter++
    };
  }

  beforeEach(() => {
    updateDocCalls = [];
    deleteDocCalls = [];
    snapshotCallback = null;
    currentUser = { uid: 'me-uid' };
    fakeNow = 1000000;
    randomIdCounter = 0;
    storageData = {};
    renderNotifListCalls = 0;
    toastMessages = [];
    badgeEl = { style: { display: '' }, textContent: '' };
    menuEl = {
      _open: false,
      classList: {
        contains: (c) => (c === 'open' ? menuEl._open : false),
        toggle: (c, force) => {
          if (c !== 'open') return false;
          menuEl._open = force !== undefined ? force : !menuEl._open;
          return menuEl._open;
        }
      }
    };
    toggleEl = { attrs: {}, setAttribute: (n, v) => (toggleEl.attrs[n] = v) };
    initNotificationsState(makeDeps());
  });

  async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  it('starts empty', () => {
    expect(combinedNotifItems()).toEqual([]);
    expect(isNotifMenuOpen()).toBe(false);
  });

  it('bootLocalNotifications loads persisted local notifications', () => {
    storageData['sakuraLocalNotifs'] = JSON.stringify([{ id: 'local_1', type: 'x', message: 'hi', createdAt: 5, read: false }]);
    bootLocalNotifications();
    expect(combinedNotifItems()).toHaveLength(1);
    expect(combinedNotifItems()[0].id).toBe('local_1');
  });

  it('bootLocalNotifications tolerates missing/corrupt storage', () => {
    storageData['sakuraLocalNotifs'] = 'not json';
    bootLocalNotifications();
    expect(combinedNotifItems()).toEqual([]);
  });

  it('pushLocalNotification adds an item, persists it, and updates the bell', () => {
    pushLocalNotification('backup_reminder', 'Back up your stuff');
    const items = combinedNotifItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'local_1000000_rid0', type: 'backup_reminder', message: 'Back up your stuff', read: false });
    expect(badgeEl.textContent).toBe('1');
    expect(badgeEl.style.display).toBe('flex');
    // Persisted for next load.
    expect(JSON.parse(storageData['sakuraLocalNotifs'])).toHaveLength(1);
  });

  it('pushLocalNotification re-renders the list only when the menu is open', () => {
    pushLocalNotification('a', 'one');
    expect(renderNotifListCalls).toBe(0);
    toggleNotifMenu(true);
    expect(renderNotifListCalls).toBe(1); // opening itself renders once
    pushLocalNotification('b', 'two');
    expect(renderNotifListCalls).toBe(2);
  });

  it('caps local notifications at 30, newest first', () => {
    for (let i = 0; i < 35; i++) {
      fakeNow = i;
      pushLocalNotification('t', 'msg' + i);
    }
    const items = combinedNotifItems();
    expect(items).toHaveLength(30);
    expect(items[0].message).toBe('msg34');
  });

  it('renderNotifBell shows 9+ once unread exceeds nine', () => {
    for (let i = 0; i < 11; i++) pushLocalNotification('t', 'm' + i);
    expect(badgeEl.textContent).toBe('9+');
  });

  it('renderNotifBell hides the badge when everything is read', async () => {
    pushLocalNotification('t', 'm');
    const id = combinedNotifItems()[0].id;
    await markNotificationRead(id);
    expect(badgeEl.style.display).toBe('none');
  });

  it('toggleNotifMenu flips state, updates aria-expanded, and renders the list when opening', () => {
    toggleNotifMenu();
    expect(isNotifMenuOpen()).toBe(true);
    expect(toggleEl.attrs['aria-expanded']).toBe('true');
    expect(renderNotifListCalls).toBe(1);
    toggleNotifMenu();
    expect(isNotifMenuOpen()).toBe(false);
    expect(toggleEl.attrs['aria-expanded']).toBe('false');
    // Closing does not re-render the list.
    expect(renderNotifListCalls).toBe(1);
  });

  it('toggleNotifMenu respects an explicit force value', () => {
    toggleNotifMenu(true);
    expect(isNotifMenuOpen()).toBe(true);
    toggleNotifMenu(true); // already open, forcing true again — still "opening"
    expect(renderNotifListCalls).toBe(2);
    toggleNotifMenu(false);
    expect(isNotifMenuOpen()).toBe(false);
  });

  it('startNotificationsListener does nothing when signed out', async () => {
    currentUser = null;
    startNotificationsListener();
    await flushMicrotasks();
    expect(snapshotCallback).toBeNull();
  });

  it('startNotificationsListener subscribes and populates notifItems from the snapshot', async () => {
    startNotificationsListener();
    await flushMicrotasks();
    expect(snapshotCallback).not.toBeNull();
    snapshotCallback!({
      docs: [{ id: 'n1', data: () => ({ type: 'share_invite', createdAt: 10, read: false, docTitle: 'X', role: 'viewer' }) }]
    });
    const items = combinedNotifItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('n1');
    expect(badgeEl.textContent).toBe('1');
  });

  it('stopNotificationsListener unsubscribes and clears cloud items (local items survive)', async () => {
    pushLocalNotification('local', 'stays');
    startNotificationsListener();
    await flushMicrotasks();
    snapshotCallback!({ docs: [{ id: 'n1', data: () => ({ createdAt: 1, read: false }) }] });
    expect(combinedNotifItems()).toHaveLength(2);
    stopNotificationsListener();
    expect(combinedNotifItems()).toHaveLength(1);
    expect(combinedNotifItems()[0].message).toBe('stays');
  });

  it('markNotificationRead updates a local item in place without a round-trip', async () => {
    pushLocalNotification('t', 'm');
    const id = combinedNotifItems()[0].id;
    await markNotificationRead(id);
    expect(combinedNotifItems()[0].read).toBe(true);
    expect(updateDocCalls).toHaveLength(0);
  });

  it('markNotificationRead writes to Firestore for a cloud item', async () => {
    await markNotificationRead('cloud-id-1');
    expect(updateDocCalls).toHaveLength(1);
    expect(updateDocCalls[0].path).toEqual(['notifications', 'me-uid', 'items', 'cloud-id-1']);
    expect(updateDocCalls[0].data).toEqual({ read: true });
  });

  it('deleteNotification removes a local item immediately', async () => {
    pushLocalNotification('t', 'm');
    const id = combinedNotifItems()[0].id;
    await deleteNotification(id);
    expect(combinedNotifItems()).toHaveLength(0);
    expect(deleteDocCalls).toHaveLength(0);
  });

  it('deleteNotification calls Firestore deleteDoc for a cloud item and shows a toast on failure', async () => {
    await deleteNotification('cloud-id-2');
    expect(deleteDocCalls).toHaveLength(1);
    expect(deleteDocCalls[0]).toEqual(['notifications', 'me-uid', 'items', 'cloud-id-2']);
    expect(toastMessages).toHaveLength(0);

    const failingMod: NotifFirestoreModLike = { ...fakeMod, deleteDoc: async () => { throw new Error('boom'); } };
    initNotificationsState({ ...makeDeps(), loadFirestoreMods: async () => ({ mod: failingMod, db: {} }) });
    await deleteNotification('cloud-id-3');
    expect(toastMessages).toEqual(['Could not dismiss — try again']);
  });

  it('clearAllNotifications clears local items synchronously and deletes cloud items', async () => {
    pushLocalNotification('t', 'local one');
    startNotificationsListener();
    await flushMicrotasks();
    snapshotCallback!({ docs: [{ id: 'cloud-1', data: () => ({ createdAt: 1, read: false }) }] });
    expect(combinedNotifItems()).toHaveLength(2);
    await clearAllNotifications();
    expect(deleteDocCalls).toEqual([['notifications', 'me-uid', 'items', 'cloud-1']]);
  });

  it('clearAllNotifications does nothing when there is nothing to clear', async () => {
    await clearAllNotifications();
    expect(deleteDocCalls).toHaveLength(0);
  });
});
