/**
 * Live presence ("who's here") state for shared documents.
 *
 * Phase 2 (docs/architecture-plan.md) — the first state-consolidation slice. Unlike Phase 1's
 * pure leaf utilities, this module's output DOES reach production: see
 * scripts/generate-index-blocks.mjs, which compiles this file and splices it into index.html
 * between the GENERATED:presence marker comments, replacing what was previously ~100 lines of
 * hand-written code using module-scoped `let`s. index.html itself is unchanged as a deployment
 * artifact — still one file, still a classic script, still served exactly as before — only HOW
 * that one block within it is produced and kept correct has changed.
 *
 * Design: the original code read `currentUser`, `sharedDocMeta`, `docShareStatusCache`,
 * `loadFirestoreMods`, and `el` directly as ambient globals — impossible to unit test without
 * either faking a whole browser+Firestore environment or testing nothing at all. Here, those
 * become an explicit `PresenceDeps` object, injected once via `initPresenceState()` rather than
 * threaded through every call (which would have meant changing every external call site's
 * signature — `startPresenceTrackingIfShared(docId)` still takes exactly one argument, matching
 * every existing call site elsewhere in index.html unchanged). For the generated production
 * block, `initPresenceState()` is called once with the real ambient globals, referenced by name
 * — since the generated code is spliced into the SAME classic-script scope as the rest of the
 * app, those names resolve correctly at runtime without any window.* indirection.
 */

export interface PresenceUser {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export interface SharedDocMetaEntry {
  ownerUid: string;
  role: string;
}

export interface FirestoreModLike {
  doc: (db: unknown, ...pathSegments: string[]) => unknown;
  collection: (db: unknown, ...pathSegments: string[]) => unknown;
  setDoc: (ref: unknown, data: Record<string, unknown>) => Promise<void>;
  deleteDoc: (ref: unknown) => Promise<void>;
  onSnapshot: (
    query: unknown,
    onNext: (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void,
    onError: (err: unknown) => void
  ) => () => void;
}

export interface PresenceDeps {
  getCurrentUser: () => PresenceUser | null;
  getSharedDocMeta: (docId: string) => SharedDocMetaEntry | undefined;
  getDocShareStatusCache: (docId: string) => unknown[] | undefined;
  loadFirestoreMods: () => Promise<{ mod: FirestoreModLike; db: unknown }>;
  getChipElement: () => HTMLElement | null;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof globalThis.setInterval>;
  clearInterval: (id: ReturnType<typeof globalThis.setInterval>) => void;
  now: () => number;
}

export const PRESENCE_HEARTBEAT_MS = 20000;
export const PRESENCE_STALE_MS = 45000;

export interface PresenceEntry {
  uid: string;
  displayName?: string;
  role?: string;
  lastSeen?: number;
}

export interface PresenceDisplay {
  visible: boolean;
  label: string;
  tooltip: string;
}

/**
 * Pure: given a list of other viewers (already filtered to non-self, non-stale), compute what
 * the chip should show. Extracted from the original `renderPresenceChip()`'s label/tooltip
 * logic — the one genuinely pure, easily-isolated piece of that function.
 */
export function computePresenceDisplay(others: PresenceEntry[]): PresenceDisplay {
  if (!others.length) return { visible: false, label: '', tooltip: '' };
  const names = others.map((p) => p.displayName || 'Someone');
  const label = names.length === 1 ? names[0] + ' is here' : names.length + ' others are here';
  const tooltip =
    names.join(', ') + (names.length > 1 ? ' are viewing this document' : ' is viewing this document');
  return { visible: true, label, tooltip };
}

/**
 * Pure: given raw snapshot docs, the current account's own uid, the current time, and the
 * staleness threshold, returns the set of OTHER viewers who are genuinely still active.
 * Extracted from the original `onSnapshot` callback's inline filter chain in
 * `startPresenceTrackingIfShared()`.
 */
export function filterLiveOthers(
  rawDocs: Array<{ id: string; data: () => Record<string, unknown> }>,
  ownUid: string,
  now: number,
  staleMs: number
): PresenceEntry[] {
  return rawDocs
    .filter((d) => d.id !== ownUid)
    .map((d) => ({ uid: d.id, ...d.data() }) as PresenceEntry)
    .filter((p) => typeof p.lastSeen === 'number' && now - p.lastSeen < staleMs);
}

let deps: PresenceDeps | null = null;
let heartbeatTimer: ReturnType<typeof globalThis.setInterval> | null = null;
let unsub: (() => void) | null = null;
let trackedDocId: string | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initPresenceState(injected: PresenceDeps): void {
  deps = injected;
  heartbeatTimer = null;
  unsub = null;
  trackedDocId = null;
}

function requireDeps(): PresenceDeps {
  if (!deps) throw new Error('presence state used before initPresenceState() was called');
  return deps;
}

function presenceOwnerUidFor(docId: string): string | null {
  const d = requireDeps();
  const meta = d.getSharedDocMeta(docId);
  if (meta) return meta.ownerUid;
  const user = d.getCurrentUser();
  return user ? user.uid : null;
}

async function writePresenceHeartbeat(docId: string): Promise<void> {
  const d = requireDeps();
  const user = d.getCurrentUser();
  if (!user) return;
  const ownerUid = presenceOwnerUidFor(docId);
  if (!ownerUid) return;
  try {
    const { mod, db } = await d.loadFirestoreMods();
    const meta = d.getSharedDocMeta(docId);
    await mod.setDoc(mod.doc(db, 'users', ownerUid, 'docs', docId, 'presence', user.uid), {
      displayName: user.displayName || user.email || 'Someone',
      role: meta ? meta.role : 'owner',
      lastSeen: d.now()
    });
  } catch (e) {
    console.warn('[sakura] presence heartbeat failed:', e);
  }
}

async function clearPresenceFor(docId: string): Promise<void> {
  const d = requireDeps();
  const user = d.getCurrentUser();
  if (!user || !docId) return;
  const ownerUid = presenceOwnerUidFor(docId);
  if (!ownerUid) return;
  try {
    const { mod, db } = await d.loadFirestoreMods();
    await mod.deleteDoc(mod.doc(db, 'users', ownerUid, 'docs', docId, 'presence', user.uid));
  } catch {
    // best-effort — staleness filter on other clients covers this regardless
  }
}

function renderPresenceChip(others: PresenceEntry[]): void {
  const d = requireDeps();
  const chip = d.getChipElement();
  if (!chip) return;
  const display = computePresenceDisplay(others);
  if (!display.visible) {
    chip.style.display = 'none';
    chip.innerHTML = '';
    return;
  }
  chip.style.display = '';
  chip.innerHTML = '<span class="doc-presence-dot"></span><span></span>';
  const labelSpan = chip.querySelector('span:last-child');
  if (labelSpan) labelSpan.textContent = display.label;
  chip.dataset.tip = display.tooltip;
}

export function stopPresenceTracking(): void {
  const d = requireDeps();
  if (heartbeatTimer) {
    d.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (unsub) {
    try {
      unsub();
    } catch {
      // ignore
    }
    unsub = null;
  }
  const prevDocId = trackedDocId;
  trackedDocId = null;
  if (prevDocId) clearPresenceFor(prevDocId);
  renderPresenceChip([]);
}

/** Whether presence tracking is currently active for this exact docId — replaces the direct read of the old `presenceDocId` global at index.html's one external call site. */
export function isPresenceTrackingDocId(docId: string): boolean {
  return trackedDocId === docId;
}

export function startPresenceTrackingIfShared(docId: string): void {
  const d = requireDeps();
  if (trackedDocId === docId) return; // already tracking this exact document
  stopPresenceTracking();
  const user = d.getCurrentUser();
  if (!user || !docId) return;
  const sharedToMe = !!d.getSharedDocMeta(docId);
  const cache = d.getDocShareStatusCache(docId);
  const ownedAndShared = !sharedToMe && Array.isArray(cache) && cache.length > 0;
  if (!sharedToMe && !ownedAndShared) return;
  trackedDocId = docId;
  writePresenceHeartbeat(docId);
  heartbeatTimer = d.setInterval(() => writePresenceHeartbeat(docId), PRESENCE_HEARTBEAT_MS);
  const ownerUid = presenceOwnerUidFor(docId);
  d.loadFirestoreMods()
    .then(({ mod, db }) => {
      if (trackedDocId !== docId) return; // switched to a different doc before this resolved
      const q = mod.collection(db, 'users', ownerUid as string, 'docs', docId, 'presence');
      unsub = mod.onSnapshot(
        q,
        (snap) => {
          const user2 = d.getCurrentUser();
          if (!user2) return;
          const others = filterLiveOthers(snap.docs, user2.uid, d.now(), PRESENCE_STALE_MS);
          renderPresenceChip(others);
        },
        (err) => console.warn('[sakura] presence listener error:', err)
      );
    })
    .catch((e) => console.warn('[sakura] could not start presence listener:', e));
}

export function handlePresenceBeforeUnload(): void {
  if (trackedDocId) clearPresenceFor(trackedDocId);
}
