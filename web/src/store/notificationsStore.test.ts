import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

function fakeUser(uid: string): User {
  return { uid } as unknown as User;
}

// §6.8 slice: notificationsStore.ts is a thin wrapper around the already-tested (see
// notifications.test.ts) `state/notifications.ts` -- this file mocks THAT module boundary rather
// than firebase/firestore directly, since the store's own job is just wiring real deps into it
// and adapting `renderNotifList`'s "trigger a re-render" callback into a Zustand `refresh()`, not
// reimplementing any of that module's own logic (see notificationsStore.ts's own header).
const mockInit = vi.fn();
const mockBoot = vi.fn();
const mockCombined = vi.fn<() => Array<{ id: string; read?: boolean; [k: string]: unknown }>>(() => []);
const mockNotifText = vi.fn((n: { message?: string }) => n.message || '');
const mockMarkRead = vi.fn().mockResolvedValue(undefined);
const mockDeleteNotification = vi.fn().mockResolvedValue(undefined);
const mockClearAll = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('../state/notifications', () => ({
  initNotificationsState: (...args: unknown[]) => mockInit(...args),
  bootLocalNotifications: (...args: unknown[]) => mockBoot(...args),
  combinedNotifItems: (...args: []) => mockCombined(...args),
  notifText: (...args: [{ message?: string }]) => mockNotifText(...args),
  markNotificationRead: (...args: unknown[]) => mockMarkRead(...args),
  deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args),
  clearAllNotifications: (...args: unknown[]) => mockClearAll(...args),
  startNotificationsListener: (...args: unknown[]) => mockStart(...args),
  stopNotificationsListener: (...args: unknown[]) => mockStop(...args)
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn()
}));

vi.mock('./authStore', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create<{ user: { uid: string } | null }>(() => ({ user: null }));
  return { useAuthStore, getFirebaseApp: vi.fn(() => ({})) };
});

import { useNotificationsStore } from './notificationsStore';
import { useAuthStore } from './authStore';

describe('notificationsStore', () => {
  beforeAll(() => {
    // init() is guarded by a module-level `inited` flag (same "call once at app startup"
    // convention as documentsStore.ts's own init) -- called once here, then its idempotency is
    // verified by a direct second call further down.
    useNotificationsStore.getState().init();
  });

  it('wires real deps into initNotificationsState, boots local notifications, and starts the listener', () => {
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockBoot).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(useNotificationsStore.getState().ready).toBe(true);
  });

  it('is idempotent -- a second init() call does not re-initialize', () => {
    useNotificationsStore.getState().init();
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockBoot).toHaveBeenCalledTimes(1);
  });

  it("the injected getCurrentUser deps reads the signed-in user's uid off useAuthStore", () => {
    const deps = mockInit.mock.calls[0][0];
    expect(deps.getCurrentUser()).toBeNull();
    useAuthStore.setState({ user: fakeUser('u1') });
    expect(deps.getCurrentUser()).toEqual({ uid: 'u1' });
    useAuthStore.setState({ user: null });
  });

  it('setMenuOpen(true) opens the menu and refreshes items from combinedNotifItems/notifText', () => {
    mockCombined.mockReturnValue([{ id: '1', read: false, message: 'hi' }]);
    mockNotifText.mockReturnValue('hi text');
    useNotificationsStore.getState().setMenuOpen(true);
    const s = useNotificationsStore.getState();
    expect(s.menuOpen).toBe(true);
    expect(s.items).toEqual([{ id: '1', read: false, message: 'hi', text: 'hi text' }]);
    expect(s.unreadCount).toBe(1);
  });

  it('setMenuOpen(false) closes the menu without re-reading notifications', () => {
    mockCombined.mockClear();
    useNotificationsStore.getState().setMenuOpen(false);
    expect(useNotificationsStore.getState().menuOpen).toBe(false);
    expect(mockCombined).not.toHaveBeenCalled();
  });

  it('markRead calls through to markNotificationRead and refreshes', async () => {
    mockCombined.mockReturnValue([]);
    await useNotificationsStore.getState().markRead('n1');
    expect(mockMarkRead).toHaveBeenCalledWith('n1');
  });

  it('remove calls through to deleteNotification and refreshes', async () => {
    await useNotificationsStore.getState().remove('n1');
    expect(mockDeleteNotification).toHaveBeenCalledWith('n1');
  });

  it('clearAll calls through to clearAllNotifications and refreshes', async () => {
    await useNotificationsStore.getState().clearAll();
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it("the injected renderNotifList callback refreshes this store's state when the underlying module calls it", () => {
    const deps = mockInit.mock.calls[0][0];
    mockCombined.mockReturnValue([{ id: 'x', read: true, message: 'x' }]);
    mockNotifText.mockReturnValue('x text');
    deps.renderNotifList();
    const s = useNotificationsStore.getState();
    expect(s.items).toEqual([{ id: 'x', read: true, message: 'x', text: 'x text' }]);
    expect(s.unreadCount).toBe(0);
  });

  it('re-starts the listener when the signed-in uid changes', () => {
    mockStart.mockClear();
    mockStop.mockClear();
    useAuthStore.setState({ user: fakeUser('new-user') });
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    useAuthStore.setState({ user: null });
  });

  it('does not restart the listener when setState fires with the same uid', () => {
    useAuthStore.setState({ user: fakeUser('same') });
    mockStart.mockClear();
    mockStop.mockClear();
    useAuthStore.setState({ user: fakeUser('same') });
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
    useAuthStore.setState({ user: null });
  });

  it('reset stops the listener and clears items/unreadCount/menuOpen', () => {
    useNotificationsStore.setState({ items: [{ id: '1', text: 'hi' }], unreadCount: 1, menuOpen: true });
    mockStop.mockClear();
    useNotificationsStore.getState().reset();
    expect(mockStop).toHaveBeenCalledTimes(1);
    const s = useNotificationsStore.getState();
    expect(s.items).toEqual([]);
    expect(s.unreadCount).toBe(0);
    expect(s.menuOpen).toBe(false);
  });
});
