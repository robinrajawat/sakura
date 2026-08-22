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
 */
export function cloudNodeToOutlineNode(raw: RawNode): OutlineNode {
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
        : null
  };
}

/**
 * Editable OutlineNode -> the raw object actually written back to Firestore. Spreads the
 * node's ORIGINAL raw cloud fields first (styles, noteTitle, decisionLog, tags, marker,
 * slideDivider, createdAt, modifiedAt, completedAt -- everything legacy's real node schema has
 * that web/'s OutlineNode doesn't yet surface), then overwrites only the fields web/ actually
 * edits on top. This is the whole reason `rawNodesById` exists: a plain `JSON.stringify(node)`
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
    codeBlock: node.codeBlock
  };
}

interface DocSummary {
  id: string;
  title: string;
}

interface DocSyncState {
  docs: DocSummary[];
  docId: string | null;
  title: string;
  loading: boolean;
  syncing: boolean;
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
  useOutlineStore.setState({
    nodes,
    selectedId: nodes[0]?.id ?? null,
    editingId: null,
    multiSelectedIds: [],
    selectionAnchorId: nodes[0]?.id ?? null
  });
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
 * Bidirectional: `pushDoc` writes (manual, not legacy's ~1.2s-debounced autosave -- deliberately
 * so, to avoid spamming production Firestore writes while this is new and being verified;
 * real autosave is a real, separately-scoped follow-up once this path is trusted). `loadDoc`
 * subscribes via `onSnapshot` for live updates, reusing the already-ported (Phase 1)
 * `shouldApplyIncomingSyncCore` for the exact same "is this our own write echoing back, or a
 * genuinely newer external change" decision legacy's own `applyIncomingDocData` makes --
 * matching legacy's real conflict-resolution semantics, not a simplified approximation of them.
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
  syncing: false,
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
    set({ loading: true, error: null, docId, crossTabNotice: false });
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
    set({ syncing: true, error: null });
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
      set({ syncing: false });
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Failed to push document' });
    }
  },

  stopWatching: () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
}));
