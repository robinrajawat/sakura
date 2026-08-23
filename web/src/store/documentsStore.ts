import { create } from 'zustand';
import { useOutlineStore, type OutlineNode } from './outlineStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';

export interface DocSummary {
  id: string;
  title: string;
  createdAt: number;
  modifiedAt: number;
}

interface StoredDoc {
  title: string;
  nodes: OutlineNode[];
}

// Distinct from legacy's own DOC_KEY_PREFIX/DOCS_INDEX_KEY (docKey()/loadDocsIndex() in
// index.html) -- same pattern in spirit (an index of {id,title,...} plus one storage entry per
// document), deliberately namespaced separately so nothing web/ does can ever collide with a
// real legacy document in the same browser's localStorage, matching this project's established
// "namespace separation, not shared keys" convention (see hubTodosStore.ts's own header on why
// its storage key isn't shared with hub.html's either).
const _DOCS_INDEX_KEY = 'sakura_web_docs_index_v1';
const _OPEN_TABS_KEY = 'sakura_web_open_tabs_v1';
const _ACTIVE_DOC_KEY = 'sakura_web_active_doc_v1';
function docStorageKey(id: string): string {
  return `sakura_web_doc_${id}_v1`;
}

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    ls()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/unavailable -- same "best effort, don't throw" convention as
    // hubTodosStore.ts/hubJournalStore.ts's own save functions.
  }
}

let nextDocNum = 1;
function generateDocId(): string {
  return `doc_${Date.now()}_${nextDocNum++}`;
}

/**
 * Per-tab view state (docs/phase6-full-parity-plan.md §6.1's "per-tab independent scroll
 * position/selection" gap, named in this store's own header above since Phase 5). Deliberately
 * session-only, in-memory (module-level `Map`, not `localStorage`) -- NOT the same thing as
 * legacy's own per-node `node.collapsed` field, which is part of the document's persisted
 * content and round-trips with it. Matching that exactly would mean moving collapse out of
 * outlineStore's separate `collapsedIds` Set and onto `OutlineNode` itself, touching
 * `StoredDoc`/`docSyncStore.ts`'s round-trip too -- a real, separately-scoped storage-format
 * change, not this slice's job. What this DOES fix: switching tabs previously reset selection to
 * the new tab's first node every time and let one document's `collapsedIds` (plain node-id
 * numbers, not namespaced per-doc) silently leak into whatever document was opened next, since
 * ids restart at 1 in every document. Restoring per-tab across a reload is out of scope for the
 * same reason -- it would need the same persisted-storage-format change as collapse.
 */
interface TabViewState {
  selectedId: number | null;
  editingId: number | null;
  multiSelectedIds: number[];
  selectionAnchorId: number | null;
  collapsedIds: Set<number>;
  scrollTop: number;
}
const tabViewCache = new Map<string, TabViewState>();
let scrollContainerEl: HTMLElement | null = null;

interface DocumentsState {
  docsIndex: DocSummary[];
  openTabs: string[];
  activeDocId: string | null;
  loaded: boolean;

  init: () => void;
  newDocument: () => void;
  openDocument: (id: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  renameDocument: (id: string, title: string) => void;
  deleteDocument: (id: string) => void;
  saveActiveDocNodes: () => void;
  /** Registers the scrollable content container so tab-switch view-state capture/restore
   * (see `TabViewState` above) has an element to read/write `scrollTop` on. Called from
   * App.tsx via a ref callback on AppShell's content pane; not part of reactive `set()` state
   * on purpose (a DOM node changing on every mount would trigger pointless re-renders of every
   * subscriber). */
  registerScrollContainer: (el: HTMLElement | null) => void;
}

/**
 * Phase 5 slice (docs/framework-migration-plan.md): Documents & Tabs, part 1 -- the store.
 * Closes the single biggest gap identified in docs/phase5-parity-checklist.md: web/ previously
 * edited exactly one in-memory document with no way to have more than one, no way to switch
 * between documents, and no persistence across a page reload at all (outlineStore's `nodes`
 * lived in memory only). This introduces a real multi-document model: a `docsIndex` (every
 * document that exists, matching legacy's own loadDocsIndex), an `openTabs` list (which of
 * those are currently open as tabs, matching legacy's own tab strip), and `activeDocId` (which
 * open tab is currently being edited in outlineStore).
 *
 * Deliberately NOT in this slice: per-tab independent undo/redo history (outlineStore itself
 * has no undo/redo at all yet, tabbed or not -- a real, separately-scoped follow-up that
 * predates and is broader than this slice), per-tab independent scroll position/selection
 * (switching tabs currently resets selection to the new tab's first node), folders, templates,
 * a searchable tab-switcher dropdown for more tabs than fit on screen. Each a real,
 * separately-scoped follow-up building on this foundation.
 */
export const useDocumentsStore = create<DocumentsState>((set, get) => {
  /** Snapshots the CURRENTLY active tab's selection/editing/multi-select/collapse/scroll state
   * into `tabViewCache`, keyed by its doc id. Call this before switching away from a tab, not
   * after -- it reads whatever `outlineStore` and `scrollContainerEl` hold right now, which
   * only means the outgoing tab as long as it runs first. */
  function captureCurrentTabView(): void {
    const activeDocId = get().activeDocId;
    if (!activeDocId) return;
    const o = useOutlineStore.getState();
    tabViewCache.set(activeDocId, {
      selectedId: o.selectedId,
      editingId: o.editingId,
      multiSelectedIds: o.multiSelectedIds,
      selectionAnchorId: o.selectionAnchorId,
      collapsedIds: new Set(o.collapsedIds),
      scrollTop: scrollContainerEl?.scrollTop ?? 0
    });
  }

  /** Applies the INCOMING tab's nodes plus its cached view state (if any) to `outlineStore`,
   * falling back to the original "select the first node" default the first time a document is
   * ever opened this session. Cached ids are filtered against the incoming `nodes` defensively
   * (a node could in principle no longer exist if it was deleted while the tab was in the
   * background) rather than trusted blindly. Scroll restore is deferred one frame -- setting
   * `scrollTop` synchronously here would run before React has committed the new tab's DOM, so
   * the container's `scrollHeight` wouldn't reflect the new content yet and the assignment
   * could be silently clamped to the outgoing tab's (possibly shorter) height. */
  function applyTabView(id: string, nodes: OutlineNode[]): void {
    const cached = tabViewCache.get(id);
    if (cached) {
      const idsInDoc = new Set(nodes.map((n) => n.id));
      const selectedId = cached.selectedId !== null && idsInDoc.has(cached.selectedId) ? cached.selectedId : (nodes[0]?.id ?? null);
      const multiSelectedIds = cached.multiSelectedIds.filter((i) => idsInDoc.has(i));
      const selectionAnchorId =
        cached.selectionAnchorId !== null && idsInDoc.has(cached.selectionAnchorId) ? cached.selectionAnchorId : selectedId;
      const collapsedIds = new Set([...cached.collapsedIds].filter((i) => idsInDoc.has(i)));
      useOutlineStore.setState({
        nodes,
        selectedId,
        // Never resume mid-inline-edit across a tab switch -- matches legacy's own behavior of
        // not re-entering edit mode on a row just because it was mid-edit when you tabbed away.
        editingId: null,
        multiSelectedIds,
        selectionAnchorId,
        collapsedIds
      });
      const { scrollTop } = cached;
      requestAnimationFrame(() => {
        if (scrollContainerEl) scrollContainerEl.scrollTop = scrollTop;
      });
    } else {
      useOutlineStore.setState({
        nodes,
        selectedId: nodes[0]?.id ?? null,
        editingId: null,
        multiSelectedIds: [],
        selectionAnchorId: nodes[0]?.id ?? null,
        collapsedIds: new Set()
      });
      requestAnimationFrame(() => {
        if (scrollContainerEl) scrollContainerEl.scrollTop = 0;
      });
    }
  }

  return {
  docsIndex: [],
  openTabs: [],
  activeDocId: null,
  loaded: false,

  init: () => {
    if (get().loaded) return;
    const docsIndex = readJson<DocSummary[]>(_DOCS_INDEX_KEY, []);
    const openTabs = readJson<string[]>(_OPEN_TABS_KEY, []);
    const storedActive = readJson<string | null>(_ACTIVE_DOC_KEY, null);
    const activeDocId = storedActive && openTabs.includes(storedActive) ? storedActive : (openTabs[0] ?? null);
    set({ docsIndex, openTabs, activeDocId, loaded: true });
    if (activeDocId) {
      const stored = readJson<StoredDoc | null>(docStorageKey(activeDocId), null);
      if (stored) useOutlineStore.setState({ nodes: stored.nodes });
    }
    // Debounced autosave: without this, an edit is only ever persisted the next time a store
    // action (switch/close/new) happens to call saveActiveDocNodes -- a user who edits and
    // then just closes the tab or reloads without switching documents would silently lose
    // that work. 800ms matches the general shape of legacy's own debounced autosave (though
    // not its exact ~1.2s figure -- not verified against that specific number here).
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    useOutlineStore.subscribe(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => get().saveActiveDocNodes(), 800);
    });
    // First-ever launch (nothing in the index at all) -- create a real first document with its
    // own explicit welcome content, rather than adopting whatever happens to be sitting in
    // outlineStore's transient in-memory state at this exact moment. This used to read
    // useOutlineStore.getState().nodes directly, which meant a fresh visitor's permanent first
    // document was whatever outlineStore.ts's own module-level seedNodes() produced -- when
    // that was Phase 0's dev/validation-spike tutorial text ("Welcome to the Sakura web spike",
    // "nodeMutations.ts — indent/outdent/move, byte-identical to legacy", etc.), every new
    // visitor's first document was permanently saved with that text as its content. Explicit
    // ownership of this content here means the two can never drift apart like that again,
    // regardless of what outlineStore's own default happens to be at any point.
    if (docsIndex.length === 0) {
      const id = generateDocId();
      const now = Date.now();
      const nodes: OutlineNode[] = [
        { id: 1, depth: 0, text: 'Welcome to Sakura', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] },
        { id: 2, depth: 1, text: 'This is your first document — start typing to replace this', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] },
        { id: 3, depth: 1, text: 'Enter creates a new line, Tab indents it', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }
      ];
      rebuildParentIdsCore(nodes);
      const summary: DocSummary = { id, title: 'Welcome', createdAt: now, modifiedAt: now };
      writeJson(docStorageKey(id), { title: summary.title, nodes });
      writeJson(_DOCS_INDEX_KEY, [summary]);
      writeJson(_OPEN_TABS_KEY, [id]);
      writeJson(_ACTIVE_DOC_KEY, id);
      set({ docsIndex: [summary], openTabs: [id], activeDocId: id });
      useOutlineStore.setState({
        nodes,
        selectedId: nodes[0]?.id ?? null,
        editingId: null,
        multiSelectedIds: [],
        selectionAnchorId: nodes[0]?.id ?? null
      });
    }
  },

  newDocument: () => {
    get().saveActiveDocNodes();
    captureCurrentTabView();
    const id = generateDocId();
    const now = Date.now();
    const summary: DocSummary = { id, title: 'Untitled', createdAt: now, modifiedAt: now };
    const nodes: OutlineNode[] = [
      { id: 1, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }
    ];
    writeJson(docStorageKey(id), { title: summary.title, nodes });
    const docsIndex = [...get().docsIndex, summary];
    const openTabs = [...get().openTabs, id];
    writeJson(_DOCS_INDEX_KEY, docsIndex);
    writeJson(_OPEN_TABS_KEY, openTabs);
    writeJson(_ACTIVE_DOC_KEY, id);
    set({ docsIndex, openTabs, activeDocId: id });
    applyTabView(id, nodes);
  },

  openDocument: (id) => {
    get().saveActiveDocNodes();
    captureCurrentTabView();
    const openTabs = get().openTabs.includes(id) ? get().openTabs : [...get().openTabs, id];
    writeJson(_OPEN_TABS_KEY, openTabs);
    writeJson(_ACTIVE_DOC_KEY, id);
    set({ openTabs, activeDocId: id });
    const stored = readJson<StoredDoc | null>(docStorageKey(id), null);
    const nodes = stored?.nodes ?? [];
    applyTabView(id, nodes);
  },

  switchTab: (id) => {
    if (id === get().activeDocId) return;
    get().openDocument(id);
  },

  closeTab: (id) => {
    // Closes the TAB only -- the document itself, and its stored content, are untouched and
    // remain reachable via openDocument again (matches README's "X icon on a tab closes the
    // tab only" exactly).
    get().saveActiveDocNodes();
    captureCurrentTabView();
    const openTabs = get().openTabs.filter((t) => t !== id);
    writeJson(_OPEN_TABS_KEY, openTabs);
    let activeDocId = get().activeDocId;
    if (activeDocId === id) {
      activeDocId = openTabs[openTabs.length - 1] ?? null;
      writeJson(_ACTIVE_DOC_KEY, activeDocId);
      if (activeDocId) {
        const stored = readJson<StoredDoc | null>(docStorageKey(activeDocId), null);
        const nodes = stored?.nodes ?? [];
        applyTabView(activeDocId, nodes);
      } else {
        useOutlineStore.setState({
          nodes: [],
          selectedId: null,
          editingId: null,
          multiSelectedIds: [],
          selectionAnchorId: null,
          collapsedIds: new Set()
        });
      }
    }
    set({ openTabs, activeDocId });
  },

  renameDocument: (id, title) => {
    const docsIndex = get().docsIndex.map((d) => (d.id === id ? { ...d, title, modifiedAt: Date.now() } : d));
    writeJson(_DOCS_INDEX_KEY, docsIndex);
    const stored = readJson<StoredDoc | null>(docStorageKey(id), null);
    if (stored) writeJson(docStorageKey(id), { ...stored, title });
    set({ docsIndex });
  },

  deleteDocument: (id) => {
    // A REAL delete -- distinct from closeTab, matches README's own distinction between
    // closing a tab (content preserved) and deleting a document (content gone).
    const docsIndex = get().docsIndex.filter((d) => d.id !== id);
    const openTabs = get().openTabs.filter((t) => t !== id);
    writeJson(_DOCS_INDEX_KEY, docsIndex);
    writeJson(_OPEN_TABS_KEY, openTabs);
    ls()?.removeItem(docStorageKey(id));
    tabViewCache.delete(id);
    let activeDocId = get().activeDocId;
    if (activeDocId === id) {
      activeDocId = openTabs[openTabs.length - 1] ?? null;
      writeJson(_ACTIVE_DOC_KEY, activeDocId);
      if (activeDocId) {
        const stored = readJson<StoredDoc | null>(docStorageKey(activeDocId), null);
        applyTabView(activeDocId, stored?.nodes ?? []);
      } else {
        useOutlineStore.setState({
          nodes: [],
          selectedId: null,
          editingId: null,
          multiSelectedIds: [],
          selectionAnchorId: null,
          collapsedIds: new Set()
        });
      }
    }
    set({ docsIndex, openTabs, activeDocId });
  },

  saveActiveDocNodes: () => {
    const { activeDocId, docsIndex } = get();
    if (!activeDocId) return;
    const nodes = useOutlineStore.getState().nodes;
    const existing = docsIndex.find((d) => d.id === activeDocId);
    const title = existing?.title ?? 'Untitled';
    writeJson(docStorageKey(activeDocId), { title, nodes });
    if (existing) {
      const nextIndex = docsIndex.map((d) => (d.id === activeDocId ? { ...d, modifiedAt: Date.now() } : d));
      writeJson(_DOCS_INDEX_KEY, nextIndex);
      set({ docsIndex: nextIndex });
    }
  },

  registerScrollContainer: (el) => {
    scrollContainerEl = el;
  }
  };
});
