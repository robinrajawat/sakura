import { create } from 'zustand';
import { collection, doc, deleteDoc, getFirestore, limit, onSnapshot, orderBy, query, updateDoc, type Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './authStore';
import { useAuthStore } from './authStore';
import {
  bootLocalNotifications,
  combinedNotifItems,
  clearAllNotifications,
  deleteNotification,
  initNotificationsState,
  markNotificationRead,
  notifText,
  startNotificationsListener,
  stopNotificationsListener,
  type NotifFirestoreModLike,
  type NotifItem
} from '../state/notifications';

/**
 * §6.8 slice: notifications inbox. A thin Zustand wrapper around the already-ported, already-
 * tested `state/notifications.ts` (an earlier bulk port, PR #86/#137 era, byte-identical to
 * legacy's own module and left unwired until now) -- this file supplies the real dependencies
 * that module's `NotifDeps` seam expects (real Firestore calls, real localStorage) rather than
 * reimplementing any of its logic. `getBadgeElement`/`getMenuElement`/`getToggleElement` are
 * legacy's own hand-rolled-DOM concerns (a badge span, a dropdown menu, a bell button) that have
 * no React equivalent worth building here -- `NotificationBell.tsx` owns its own badge count/
 * open state directly from THIS store's `items`/`menuOpen` rather than reading a DOM node back
 * out of `state/notifications.ts`, so all three getters are no-ops and `toggleNotifMenu`/
 * `isNotifMenuOpen` (the two functions that read/write those DOM nodes) are deliberately NOT
 * re-exported from this store -- `menuOpen` below is this store's own, React-native equivalent.
 * `renderNotifList` (the one real callback that module needs, per its own file header, to
 * trigger a re-render after any state change) is where this store hooks in: it just calls
 * `refresh()` below, which re-reads `combinedNotifItems()`/`notifText()` into Zustand state so
 * React components re-render normally, rather than hand-building DOM the way legacy's real
 * `renderNotifList` does.
 */

export interface NotifDisplayItem extends NotifItem {
  text: string;
}

function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

interface NotificationsState {
  items: NotifDisplayItem[];
  unreadCount: number;
  menuOpen: boolean;
  ready: boolean;

  init: () => void;
  setMenuOpen: (open: boolean) => void;
  markRead: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  reset: () => void;
}

function refresh(set: (partial: Partial<NotificationsState>) => void): void {
  const items = combinedNotifItems().map((n) => ({ ...n, text: notifText(n) }));
  set({ items, unreadCount: items.filter((n) => !n.read).length });
}

let inited = false;

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  menuOpen: false,
  ready: false,

  init: () => {
    if (inited) return;
    inited = true;
    initNotificationsState({
      getCurrentUser: () => {
        const user = useAuthStore.getState().user;
        return user ? { uid: user.uid } : null;
      },
      loadFirestoreMods: async () => ({
        db: getDb(),
        // Cast at the module boundary, same as this project's own established
        // `x as unknown as Y` convention for adapting a real SDK's richer types down to a
        // deliberately loose injected-deps interface (see e.g. presence.test.ts/hubTodos.test.ts) --
        // the real Firestore `onSnapshot`'s callback receives a full `QuerySnapshot`, a structural
        // superset of `NotifFirestoreModLike`'s own `{docs: Array<{id,data}>}` shape.
        mod: {
          doc: (db: unknown, ...segs: string[]) => doc(db as Firestore, ...(segs as [string, ...string[]])),
          collection: (db: unknown, ...segs: string[]) => collection(db as Firestore, ...(segs as [string, ...string[]])),
          query,
          orderBy,
          limit,
          updateDoc,
          deleteDoc,
          onSnapshot
        } as unknown as NotifFirestoreModLike
      }),
      getLocalStorage: () => (typeof localStorage === 'undefined' ? null : localStorage),
      // No DOM badge/menu/toggle in React -- see this file's own header for why.
      getBadgeElement: () => null,
      getMenuElement: () => null,
      getToggleElement: () => null,
      showToast: (msg) => console.warn('[sakura]', msg),
      renderNotifList: () => refresh(set),
      now: () => Date.now(),
      randomId: () => Math.random().toString(36).slice(2)
    });
    bootLocalNotifications();
    refresh(set);
    set({ ready: true });
    startNotificationsListener();
    useAuthStore.subscribe((state, prevState) => {
      if (state.user?.uid === prevState.user?.uid) return;
      stopNotificationsListener();
      if (state.user) startNotificationsListener();
      refresh(set);
    });
  },

  setMenuOpen: (open) => {
    set({ menuOpen: open });
    if (open) refresh(set);
  },

  markRead: async (id) => {
    await markNotificationRead(id);
    refresh(set);
  },

  remove: async (id) => {
    await deleteNotification(id);
    refresh(set);
  },

  clearAll: async () => {
    await clearAllNotifications();
    refresh(set);
  },

  reset: () => {
    stopNotificationsListener();
    set({ items: [], unreadCount: 0, menuOpen: false });
  }
}));
