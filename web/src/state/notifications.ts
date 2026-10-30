/**
 * Notifications inbox state (Firestore-backed notifications such as sent copies, plus a separate
 * local/device-only channel for backup and sync events — see the header comment this file's
 * generated output replaces in index.html for why those two channels exist and are merged
 * for display via `combinedNotifItems()`).
 *
 * Phase 2 (docs/architecture-plan.md) — second state-consolidation slice, same pipeline as
 * src/state/presence.ts: compiled by scripts/generate-index-blocks.mjs and spliced into
 * index.html between GENERATED:notifications marker comments, sharing the classic script's
 * own scope at runtime (no window.* indirection, no signature changes at any existing call
 * site).
 *
 * Scope decision, different from presence: `renderNotifList()` — the function that builds the
 * actual notification-list DOM (many `document.createElement` calls, nested elements, click
 * handlers) — is deliberately NOT part of this module. It has no state of its own worth
 * consolidating and no meaningful pure sub-logic to isolate (unlike presence's chip label/
 * tooltip math), so moving it here would just be relocating hand-written DOM-building code
 * without making anything more testable — the actual value in this extraction is the state
 * machine and the business logic around it (what merges with what, what counts as read, what
 * a given notification says). `renderNotifList` stays exactly where it is in index.html,
 * calling this module's exported functions (`combinedNotifItems`, `notifText`,
 * `markNotificationRead`, `deleteNotification`, `toggleNotifMenu`) exactly as it always has —
 * so its own body needs zero changes. This module treats it as an injected dependency
 * (`renderNotifList` on `NotifDeps`) so the handful of internal call sites that used to call it
 * directly (after pushing a local notification, after the Firestore listener fires, after
 * deleting/clearing) still trigger it, without this module needing to own DOM construction.
 */

export interface NotifUser {
  uid: string;
}

export interface NotifItem {
  id: string;
  type?: string;
  createdAt?: number;
  read?: boolean;
  message?: string;
  docTitle?: string;
  fromDisplayName?: string;
  fromEmail?: string;
  fromUid?: string;
  docId?: string;
  role?: string;
  /** doc_copy only: the recipient's own document id once they added the copy. */
  addedDocId?: string;
}

export interface NotifFirestoreModLike {
  doc: (db: unknown, ...pathSegments: string[]) => unknown;
  collection: (db: unknown, ...pathSegments: string[]) => unknown;
  query: (...args: unknown[]) => unknown;
  orderBy: (field: string, direction: string) => unknown;
  limit: (n: number) => unknown;
  updateDoc: (ref: unknown, data: Record<string, unknown>) => Promise<void>;
  deleteDoc: (ref: unknown) => Promise<void>;
  onSnapshot: (
    query: unknown,
    onNext: (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void,
    onError: (err: unknown) => void
  ) => () => void;
}

export interface LocalStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface NotifDeps {
  getCurrentUser: () => NotifUser | null;
  loadFirestoreMods: () => Promise<{ mod: NotifFirestoreModLike; db: unknown }>;
  getLocalStorage: () => LocalStorageLike | null;
  getBadgeElement: () => HTMLElement | null;
  getMenuElement: () => HTMLElement | null;
  getToggleElement: () => HTMLElement | null;
  showToast: (msg: string) => void;
  /** Hand-written DOM-building code left in index.html — see the file header for why. */
  renderNotifList: () => void;
  now: () => number;
  randomId: () => string;
}

const LOCAL_NOTIF_KEY = 'sakuraLocalNotifs';
const LOCAL_NOTIF_CAP = 30;

let notifDeps: NotifDeps | null = null;
let notifItems: NotifItem[] = [];
let _notifUnsub: (() => void) | null = null;
let notifMenuOpen = false;
let localNotifItems: NotifItem[] = [];

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initNotificationsState(injected: NotifDeps): void {
  notifDeps = injected;
  notifItems = [];
  _notifUnsub = null;
  notifMenuOpen = false;
  localNotifItems = [];
}

function requireNotifDeps(): NotifDeps {
  if (!notifDeps) throw new Error('notifications state used before initNotificationsState() was called');
  return notifDeps;
}

/** Whether the notification menu is currently open — read by index.html's outside-click handler. */
export function isNotifMenuOpen(): boolean {
  return notifMenuOpen;
}

/**
 * Pure: what a notification's own list-item text should read, given its type and payload.
 * Extracted unchanged from the original `notifText()`.
 */
export function notifText(n: NotifItem): string {
  if (n.type === 'doc_copy') {
    const title = n.docTitle || 'a document';
    if (n.addedDocId) return `Added "${title}" to your documents`;
    const from = n.fromDisplayName || n.fromEmail || 'Someone';
    return `${from} sent you a copy of "${title}"`;
  }
  return n.message || 'New notification';
}

/** The cloud (Firestore) and local (device-only) notification channels merged, newest first. */
export function combinedNotifItems(): NotifItem[] {
  return [...notifItems, ...localNotifItems].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function loadLocalNotifItems(): void {
  const d = requireNotifDeps();
  try {
    const storage = d.getLocalStorage();
    const raw = storage ? storage.getItem(LOCAL_NOTIF_KEY) : null;
    localNotifItems = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(localNotifItems)) localNotifItems = [];
  } catch {
    localNotifItems = [];
  }
}

function saveLocalNotifItems(): void {
  const d = requireNotifDeps();
  try {
    d.getLocalStorage()?.setItem(LOCAL_NOTIF_KEY, JSON.stringify(localNotifItems.slice(0, LOCAL_NOTIF_CAP)));
  } catch {
    // ignore — best-effort persistence, same as the original
  }
}

export function renderNotifBell(): void {
  const d = requireNotifDeps();
  const badge = d.getBadgeElement();
  if (!badge) return;
  const unread = combinedNotifItems().filter((n) => !n.read).length;
  badge.style.display = unread > 0 ? 'flex' : 'none';
  badge.textContent = unread > 9 ? '9+' : String(unread);
}

export function pushLocalNotification(type: string, message: string): void {
  const d = requireNotifDeps();
  localNotifItems.unshift({
    id: 'local_' + d.now() + '_' + d.randomId(),
    type,
    message,
    createdAt: d.now(),
    read: false
  });
  localNotifItems = localNotifItems.slice(0, LOCAL_NOTIF_CAP);
  saveLocalNotifItems();
  renderNotifBell();
  if (notifMenuOpen) d.renderNotifList();
}

export function startNotificationsListener(): void {
  const d = requireNotifDeps();
  stopNotificationsListener();
  if (!d.getCurrentUser()) return;
  d.loadFirestoreMods()
    .then(({ mod, db }) => {
      const user = d.getCurrentUser();
      if (!user) return; // signed out again before this resolved
      const q = mod.query(mod.collection(db, 'notifications', user.uid, 'items'), mod.orderBy('createdAt', 'desc'), mod.limit(30));
      _notifUnsub = mod.onSnapshot(
        q,
        (snap) => {
          notifItems = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as NotifItem);
          renderNotifBell();
          if (notifMenuOpen) d.renderNotifList();
        },
        (err) => console.warn('[sakura] notifications listener error:', err)
      );
    })
    .catch((e) => console.warn('[sakura] could not start notifications listener:', e));
}

export function stopNotificationsListener(): void {
  if (_notifUnsub) {
    try {
      _notifUnsub();
    } catch {
      // ignore
    }
    _notifUnsub = null;
  }
  notifItems = [];
  renderNotifBell();
}

export async function markNotificationRead(id: string): Promise<void> {
  const d = requireNotifDeps();
  if (!id) return;
  if (id.startsWith('local_')) {
    const n = localNotifItems.find((x) => x.id === id);
    if (n) {
      n.read = true;
      saveLocalNotifItems();
      renderNotifBell();
    }
    return;
  }
  const user = d.getCurrentUser();
  if (!user) return;
  try {
    const { mod, db } = await d.loadFirestoreMods();
    await mod.updateDoc(mod.doc(db, 'notifications', user.uid, 'items', id), { read: true });
  } catch (e) {
    console.warn('[sakura] markNotificationRead failed:', e);
  }
}

/** Best-effort removal of a sent copy (copies/{uid}/items/{copyId}) whose notification is gone. */
async function deleteSentCopy(mod: NotifFirestoreModLike, db: unknown, uid: string, copyId: string): Promise<void> {
  try {
    await mod.deleteDoc(mod.doc(db, 'copies', uid, 'items', copyId));
  } catch (e) {
    console.warn('[sakura] could not remove a sent copy:', e);
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const d = requireNotifDeps();
  if (!id) return;
  if (id.startsWith('local_')) {
    localNotifItems = localNotifItems.filter((x) => x.id !== id);
    saveLocalNotifItems();
    renderNotifBell();
    if (notifMenuOpen) d.renderNotifList();
    return;
  }
  const user = d.getCurrentUser();
  if (!user) return;
  try {
    const { mod, db } = await d.loadFirestoreMods();
    const item = notifItems.find((x) => x.id === id);
    await mod.deleteDoc(mod.doc(db, 'notifications', user.uid, 'items', id));
    // A dismissed sent copy goes too, so it doesn't linger unseen in the recipient's inbox.
    if (item && item.type === 'doc_copy' && item.docId) await deleteSentCopy(mod, db, user.uid, item.docId);
    // No local-array splice needed for this branch — the Firestore onSnapshot listener already
    // updates notifItems and re-renders on its own once the delete round-trips back.
  } catch (e) {
    console.warn('[sakura] deleteNotification failed:', e);
    d.showToast('Could not dismiss — try again');
  }
}

export async function clearAllNotifications(): Promise<void> {
  const d = requireNotifDeps();
  const items = combinedNotifItems();
  if (!items.length) return;
  // Local items: clear synchronously, no round-trip needed.
  localNotifItems = [];
  saveLocalNotifItems();
  // Cloud items: best-effort parallel delete. A failure on one doesn't block the rest.
  const cloudIds = notifItems.map((n) => n.id);
  const copyIds = notifItems.filter((n) => n.type === 'doc_copy' && n.docId).map((n) => n.docId as string);
  const user = d.getCurrentUser();
  if (cloudIds.length && user) {
    try {
      const { mod, db } = await d.loadFirestoreMods();
      await Promise.all(
        cloudIds.map((id) =>
          mod.deleteDoc(mod.doc(db, 'notifications', user.uid, 'items', id)).catch((e: unknown) =>
            console.warn('[sakura] clearAllNotifications: one delete failed:', e)
          )
        )
      );
      await Promise.all(copyIds.map((copyId) => deleteSentCopy(mod, db, user.uid, copyId)));
    } catch (e) {
      console.warn('[sakura] clearAllNotifications failed:', e);
    }
  }
  renderNotifBell();
  if (notifMenuOpen) d.renderNotifList();
}

export function toggleNotifMenu(force?: boolean): void {
  const d = requireNotifDeps();
  const menu = d.getMenuElement();
  if (!menu) return;
  notifMenuOpen = force !== undefined ? force : !menu.classList.contains('open');
  menu.classList.toggle('open', notifMenuOpen);
  d.getToggleElement()?.setAttribute('aria-expanded', String(notifMenuOpen));
  if (notifMenuOpen) d.renderNotifList();
}

/** Called once at startup (mirrors the original's unconditional top-level call). */
export function bootLocalNotifications(): void {
  loadLocalNotifItems();
}
