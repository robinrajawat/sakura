/**
 * Admin status (feedback-inbox access control).
 *
 * Phase 2 (docs/architecture-plan.md) — third state-consolidation slice, same generator
 * pipeline as src/state/presence.ts and src/state/notifications.ts.
 *
 * Two independent checks combine into `isAdmin`, kept as an OR rather than either replacing
 * the other: a hardcoded-email fast path (`isFeedbackAdmin`, instant, zero flicker for the one
 * account it matches) and a data-driven Firestore check (`checkIsCollectionAdmin`, async,
 * starts false and only ever flips true once the read resolves — so it only affects a
 * hypothetical second admin, never the hardcoded account's own experience, and that account
 * can never get locked out even if the admins collection is empty, misconfigured, or a rules
 * deploy lags behind). `_adminCheckToken` guards against a stale async result from a
 * since-superseded sign-in landing after a newer one (rapid sign-out/sign-in).
 *
 * Naming note (learned from the presence/notifications collision, see PR #6): `isAdmin` and
 * `_adminCheckToken` are kept UNEXPORTED here, matching their original names exactly. In this
 * splicing model that isn't real encapsulation — every top-level declaration in every generated
 * block still shares one script scope at runtime regardless of the TypeScript `export` keyword,
 * which only affects whether Vitest can import a symbol directly and only matters for the
 * cross-block collision check. It's used here specifically so index.html's one external
 * `isAdmin` read keeps working as a bare identifier with zero call-site changes, exactly as
 * before — `isAdminNow()` is exported separately for tests to read the same state.
 */

export interface AdminUser {
  uid: string;
  email?: string | null;
}

export interface AdminFirestoreModLike {
  doc: (db: unknown, ...pathSegments: string[]) => unknown;
  getDoc: (ref: unknown) => Promise<{ exists: () => boolean }>;
}

export interface AdminDeps {
  loadFirestoreMods: () => Promise<{ mod: AdminFirestoreModLike; db: unknown }>;
  getAdminSectionElement: () => HTMLElement | null;
  closeFeedbackInboxModal: () => void;
}

// This account can never get locked out of the feedback inbox even if the `admins` Firestore
// collection is empty, misconfigured, or a rules deploy lags behind — see isFeedbackAdmin.
const FEEDBACK_ADMIN_EMAIL = 'robinsinghrajawat@gmail.com';

let adminDeps: AdminDeps | null = null;
let isAdmin = false;
let _adminCheckToken = 0;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initAdminState(injected: AdminDeps): void {
  adminDeps = injected;
  isAdmin = false;
  _adminCheckToken = 0;
}

function requireAdminDeps(): AdminDeps {
  if (!adminDeps) throw new Error('admin state used before initAdminState() was called');
  return adminDeps;
}

/** Pure: the hardcoded-email fast path. Extracted unchanged from the original `isFeedbackAdmin()`. */
export function isFeedbackAdmin(user: AdminUser | null): boolean {
  return !!user && !!user.email && user.email.toLowerCase() === FEEDBACK_ADMIN_EMAIL;
}

/**
 * Data-driven admin check: does an /admins/{uid} doc exist for this person? See firestore.rules
 * for the collection's own rule (a user may only read their OWN doc, existence-only, no listing).
 */
async function checkIsCollectionAdmin(uid: string): Promise<boolean> {
  if (!uid) return false;
  const d = requireAdminDeps();
  try {
    const { mod, db } = await d.loadFirestoreMods();
    const snap = await mod.getDoc(mod.doc(db, 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

/** For tests (and any future external reader) — mirrors the bare `isAdmin` this module also declares. */
export function isAdminNow(): boolean {
  return isAdmin;
}

export function updateFeedbackAdminUI(): void {
  const d = requireAdminDeps();
  const sec = d.getAdminSectionElement();
  if (sec) {
    sec.style.display = isAdmin ? '' : 'none';
    sec.dataset.featureHidden = isAdmin ? '' : '1';
  }
  if (!isAdmin) d.closeFeedbackInboxModal();
}

export function refreshAdminStatus(user: AdminUser | null): void {
  isAdmin = isFeedbackAdmin(user);
  updateFeedbackAdminUI();
  const token = ++_adminCheckToken;
  if (!user) return;
  checkIsCollectionAdmin(user.uid).then((result) => {
    if (token !== _adminCheckToken || !result) return;
    isAdmin = true;
    updateFeedbackAdminUI();
  });
}
