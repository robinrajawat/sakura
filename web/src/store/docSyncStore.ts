import { create } from 'zustand';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { getFirebaseApp } from './authStore';
import { useOutlineStore, type OutlineNode } from './outlineStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';
import { shouldApplyIncomingSyncCore } from '../state/syncApply';

type RawNode = Record<string, unknown>;
export type { RawNode };

function getDb() {
  return getFirestore(getFirebaseApp());
}

/**
 * Cloud raw node -> editable OutlineNode. Deliberately loose/defensive, matching legacy's own
 * normalizeNode's spirit (never trust cloud data blindly) but not its full field set -- only
 * the fields web/'s OutlineNode actually understands are read here. `parentId` is NOT trusted
 * from the cloud value at all: outlineStore's own convention (see seedNodes) is that parentId
 * is always DERIVED from depth + array order via rebuildParentIdsCore, never read from stored
 * data directly, so this intentionally sets it to `null` as a placeholder the caller
 * immediately overwrites.
 *
 * `tags` and `styles` are KNOWN, read/write fields here (Tags & Focus slice; Phase 6.2's
 * rich-formatting slice) -- not blindly preserved as an unknown legacy field the way `marker`/
 * `noteTitle`/etc. still are below. Legacy's own per-node `tags` array is exactly web/'s
 * OutlineNode `tags` shape already (a flat string array), so that's a direct, honest round-trip.
 * `styles` needs real validation matching legacy's own `normalizeStyles`
 * (legacy/index.html:9718) rather than a direct pass-through, since a raw cloud value could in
 * principle hold a `heading` outside 1-6 or a `highlight`/`color` legacy itself wouldn't
 * recognize -- same defensive posture as `codeBlock` below, just with real per-field validation
 * instead of an object/non-object check. `highlight`/`color` are read through for full
 * round-trip fidelity even though web/'s own UI doesn't yet write non-`false` values for either
 * (see `NodeStyles`'s own header in outlineStore.ts) -- a document already carrying a highlight
 * or font color from legacy keeps showing it correctly in web/, it just can't be changed there
 * yet.
 */
export function cloudNodeToOutlineNode(raw: RawNode): OutlineNode {
  const rawStyles = raw.styles && typeof raw.styles === 'object' ? (raw.styles as Record<string, unknown>) : {};
  const heading = Number.isInteger(rawStyles.heading) && (rawStyles.heading as number) >= 1 && (rawStyles.heading as number) <= 6 ? (rawStyles.heading as number) : 0;
  return {
    id: Number(raw.id) || 0,
    depth: Number(raw.depth) || 0,
    text: typeof raw.text === 'string' ? raw.text : '',
    parentId: null,
    isCheckbox: !!raw.isCheckbox,
    checked: !!raw.checked,
    note: typeof raw.note === 'string' ? raw.note : '',
    codeBlock:
      raw.codeBlock && typeof raw.codeBlock === 'object'
        ? (raw.codeBlock as OutlineNode['codeBlock'])
        : null,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : [],
    styles: {
      bold: !!rawStyles.bold,
      italic: !!rawStyles.italic,
      underline: !!rawStyles.underline,
      strike: !!rawStyles.strike,
      heading,
      highlight: typeof rawStyles.highlight === 'string' ? rawStyles.highlight : false,
      color: typeof rawStyles.color === 'string' ? rawStyles.color : false
    }
  };
}

/**
 * Editable OutlineNode -> the raw object actually written back to Firestore. Spreads the
 * node's ORIGINAL raw cloud fields first (noteTitle, decisionLog, marker, slideDivider,
 * createdAt, modifiedAt, completedAt -- everything legacy's real node schema has that web/'s
 * OutlineNode doesn't yet surface; `tags`/`styles` USED to be in this preserved-but-unsurfaced
 * list but are now known fields web/ edits, same as `note`/`codeBlock` below), then overwrites
 * only the fields web/ actually edits on top. This is the whole reason `rawNodesById` exists: a
 * plain `JSON.stringify(node)`
 * here would silently strip every legacy-only field from every node on the very first push,
 * corrupting real production data for any legacy user who opens their document in the web app.
 * A node with no raw counterpart (created fresh in the web app, never existed in the cloud
 * before) has nothing to preserve, so it's written with just the fields web/ knows -- legacy's
 * own normalizeNode already defaults every missing field the next time IT loads this node.
 */
export function outlineNodeToRawNode(node: OutlineNode, raw: RawNode | undefined): RawNode {
  return {
    ...(raw ?? {}),
    id: node.id,
    depth: node.depth,
    text: node.text,
    parentId: node.parentId,
    isCheckbox: node.isCheckbox,
    checked: node.checked,
    note: node.note,
    codeBlock: node.codeBlock,
    tags: node.tags,
    styles: node.styles
  };
}

interface DocSummary {
  id: string;
  title: string;
}

// Matches legacy's own real sync-status states (`updateSyncStatusUI`, legacy/index.html:15583) --
// 'idle' covers both "nothing loaded yet" and legacy's separate resting 'idle-ok' dot state,
// collapsed into one here since this slice doesn't reproduce the dot's own brief
// bright-then-dim fade choreography, just the status text itself (see DocSyncPanel.tsx).
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface DocSyncState {
  docs: DocSummary[];
  docId: string | null;
  title: string;
  loading: boolean;
  syncStatus: SyncStatus;
  error: string | null;
  crossTabNotice: boolean;

  listDocs: (uid: string) => Promise<void>;
  loadDoc: (uid: string, docId: string) => Promise<void>;
  pushDoc: (uid: string) => Promise<void>;
  stopWatching: () => void;
}

// Per-document bookkeeping that doesn't belong in the Zustand-visible state itself (mirrors
// legacy's own module-level `_lastPushedTs` / raw-node-cache pattern rather than putting
// non-serializable Maps and unsubscribe functions into store state).
const rawNodesById = new Map<string, RawNode>();
let lastPushedTs: number | undefined;
let lastKnownUpdatedAt: number | null = null;
let unsubscribe: Unsubscribe | null = null;
// The outline-change listener that queues an autosave push (see loadDoc/scheduleSync below),
// and its own pending debounce timer -- both live only while a doc is actually loaded.
let outlineUnsubscribe: (() => void) | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

// Set for the duration of an incoming-cloud-data apply (`applyCloudDoc`'s own `setState` call
// below) so the outline-change subscription `loadDoc` sets up (see its own comment) can tell
// "the user just edited something, queue a push" apart from "this state change IS a push's own
// echo coming back down" -- without this, every realtime update would immediately queue a
// redundant push of the exact content just received, matching neither legacy's real behavior
// (`queueSync` is only ever called from the local-edit-commit path, never from
// `applyIncomingDocData`) nor anyone's actual intent.
let isApplyingRemoteUpdate = false;

function applyCloudDoc(
  cloud: RawNode,
  viaRealtime: boolean,
  setDocSyncState: (partial: Partial<DocSyncState>) => void
) {
  const cloudNodes = Array.isArray(cloud.nodes) ? (cloud.nodes as RawNode[]) : [];
  rawNodesById.clear();
  const nodes: OutlineNode[] = cloudNodes.map((raw) => {
    if (typeof raw.id === 'number' || typeof raw.id === 'string') {
      rawNodesById.set(String(raw.id), raw);
    }
    return cloudNodeToOutlineNode(raw);
  });
  rebuildParentIdsCore(nodes);
  isApplyingRemoteUpdate = true;
  useOutlineStore.setState({
    nodes,
    selectedId: nodes[0]?.id ?? null,
    editingId: null,
    multiSelectedIds: [],
    selectionAnchorId: nodes[0]?.id ?? null
  });
  isApplyingRemoteUpdate = false;
  lastKnownUpdatedAt = Number(cloud.updatedAt) || 0;
  setDocSyncState({
    title: typeof cloud.title === 'string' ? cloud.title : 'Untitled',
    crossTabNotice: viaRealtime
  });
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): account/sync, part 2 of 2 -- Firestore
 * document sync. Writes into the SAME real `users/{uid}/docs/{docId}` collection legacy's live
 * users' documents already live in (see outlineNodeToRawNode's own header for how this avoids
 * destroying legacy-only per-node fields).
 *
 * Bidirectional: `pushDoc` writes, now on the SAME real debounced-autosave schedule legacy's own
 * `queueSync`/`flushSyncQueue` uses (legacy/index.html:15576-15607) -- §6.8 slice, once manual
 * push had been trusted for a while. `loadDoc` sets up an `useOutlineStore.subscribe` listener
 * (torn down in `stopWatching`, same lifetime as the Firestore `onSnapshot` listener below) that
 * debounces 1500ms before calling `pushDoc`, matching legacy's own real timer constant exactly
 * (`_syncPushTimer=setTimeout(flushSyncQueue,1500)`) -- not the "~1.2s" figure a few of this
 * project's other comments/docs describe it as, which was this project's own earlier
 * approximation before actually reading the real constant. `isApplyingRemoteUpdate` (above)
 * guards against a realtime pull re-triggering that same subscription and queueing a pointless
 * echo push straight back to the cloud. `loadDoc` subscribes to Firestore via `onSnapshot` for
 * live updates, reusing the already-ported (Phase 1) `shouldApplyIncomingSyncCore` for the exact
 * same "is this our own write echoing back, or a genuinely newer external change" decision
 * legacy's own `applyIncomingDocData` makes -- matching legacy's real conflict-resolution
 * semantics, not a simplified approximation of them. `syncStatus` mirrors legacy's own real
 * `updateSyncStatusUI` states (idle/syncing/synced/error) for the panel's status text -- see that
 * type's own header for the one real simplification (no separate fading "dot" choreography).
 *
 * Deliberately NOT in this slice: sharing/collaboration (`sharedWith`, `grantDocumentAccess`),
 * diagram XML in the push payload, the `_docTooLargeToastShown` 1MB-limit UX, cross-tab banner
 * dismissal UI (`crossTabNotice` is exposed as a flag; the panel shows and lets it be
 * acknowledged, nothing fancier). Each a real, separately-scoped follow-up.
 */
export const useDocSyncStore = create<DocSyncState>((set, get) => ({
  docs: [],
  docId: null,
  title: '',
  loading: false,
  syncStatus: 'idle',
  error: null,
  crossTabNotice: false,

  listDocs: async (uid) => {
    // NOTE: this queries the `docs` subcollection directly (a collection-level list), which
    // legacy itself never does -- legacy maintains its own local index in localStorage
    // (loadDocsIndex/DOCS_INDEX_KEY) instead of querying Firestore's collection for a listing.
    // This project has no visibility into the deployed Firestore security rules, so whether a
    // collection-level `list` query is actually permitted (as opposed to only `get` on a known
    // doc id) is a genuine open question, not something verified against the real rules here.
    // The failure mode is safe either way: a permission-denied error lands in `error` below and
    // shows in the panel, it doesn't crash or corrupt anything. If this turns out to be blocked,
    // the fallback is a manual doc-id entry field instead of a populated dropdown, matching
    // legacy's own local-index approach more closely -- a real follow-up once actually
    // exercised against production by a signed-in user.
    set({ loading: true, error: null });
    try {
      const snap = await getDocs(collection(getDb(), 'users', uid, 'docs'));
      const docs: DocSummary[] = snap.docs.map((d) => ({
        id: d.id,
        title: typeof d.data().title === 'string' ? (d.data().title as string) : 'Untitled'
      }));
      set({ docs, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to list documents' });
    }
  },

  loadDoc: async (uid, docId) => {
    get().stopWatching();
    set({ loading: true, error: null, docId, crossTabNotice: false, syncStatus: 'idle' });
    try {
      const ref = doc(getDb(), 'users', uid, 'docs', docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        applyCloudDoc(snap.data() as RawNode, false, set);
      } else {
        set({ title: 'Untitled', crossTabNotice: false });
        rawNodesById.clear();
        lastKnownUpdatedAt = null;
      }
      set({ loading: false });
      unsubscribe = onSnapshot(ref, (liveSnap) => {
        if (!liveSnap.exists()) return;
        const cloud = liveSnap.data() as RawNode;
        if (!shouldApplyIncomingSyncCore(cloud.updatedAt, lastKnownUpdatedAt, lastPushedTs)) return;
        applyCloudDoc(cloud, true, set);
      });
      // Debounced autosave (§6.8) -- see this store's own header comment for the full
      // reasoning/legacy citation. `isApplyingRemoteUpdate` (set around the `applyCloudDoc`
      // calls above and in `stopWatching`'s caller, `loadDoc` itself, via the initial
      // `applyCloudDoc` call above) means an incoming cloud update never queues its own echo.
      outlineUnsubscribe = useOutlineStore.subscribe(() => {
        if (isApplyingRemoteUpdate) return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          void get().pushDoc(uid);
        }, 1500);
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load document' });
    }
  },

  pushDoc: async (uid) => {
    // docId only ever comes from loadDoc (itself only reachable by picking an already-existing
    // document from listDocs' results) -- pushDoc can therefore never create a stray new
    // top-level document with an unexpected id; it only ever writes into a document that
    // already existed before this session touched it. Deliberate, not incidental.
    const { docId, title } = get();
    if (!docId) return;
    set({ syncStatus: 'syncing', error: null });
    try {
      const nodes = useOutlineStore.getState().nodes;
      const rawNodes = nodes.map((n) => outlineNodeToRawNode(n, rawNodesById.get(String(n.id))));
      const ts = Date.now();
      lastPushedTs = ts;
      const ref = doc(getDb(), 'users', uid, 'docs', docId);
      await setDoc(
        ref,
        {
          nodes: rawNodes,
          title,
          lastEditedByUid: uid,
          updatedAt: ts
        },
        { merge: true }
      );
      lastKnownUpdatedAt = ts;
      rawNodes.forEach((raw) => {
        if (typeof raw.id === 'number' || typeof raw.id === 'string') rawNodesById.set(String(raw.id), raw);
      });
      set({ syncStatus: 'synced' });
    } catch (err) {
      set({ syncStatus: 'error', error: err instanceof Error ? err.message : 'Failed to push document' });
    }
  },

  stopWatching: () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (outlineUnsubscribe) {
      outlineUnsubscribe();
      outlineUnsubscribe = null;
    }
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
  }
}));
