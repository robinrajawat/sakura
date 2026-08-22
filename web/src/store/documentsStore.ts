import { create } from 'zustand';
import { useOutlineStore, type OutlineNode } from './outlineStore';

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
export const useDocumentsStore = create<DocumentsState>((set, get) => ({
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
    // First-ever launch (nothing in the index at all) -- adopt outlineStore's own current seed
    // content (the welcome/tutorial nodes) as the first real document, rather than either
    // leaving it with no document/tab backing it at all, or discarding it in favor of
    // newDocument()'s blank template.
    if (docsIndex.length === 0) {
      const id = generateDocId();
      const now = Date.now();
      const nodes = useOutlineStore.getState().nodes;
      const summary: DocSummary = { id, title: 'Welcome', createdAt: now, modifiedAt: now };
      writeJson(docStorageKey(id), { title: summary.title, nodes });
      writeJson(_DOCS_INDEX_KEY, [summary]);
      writeJson(_OPEN_TABS_KEY, [id]);
      writeJson(_ACTIVE_DOC_KEY, id);
      set({ docsIndex: [summary], openTabs: [id], activeDocId: id });
    }
  },

  newDocument: () => {
    get().saveActiveDocNodes();
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
    useOutlineStore.setState({
      nodes,
      selectedId: nodes[0]?.id ?? null,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: nodes[0]?.id ?? null
    });
  },

  openDocument: (id) => {
    get().saveActiveDocNodes();
    const openTabs = get().openTabs.includes(id) ? get().openTabs : [...get().openTabs, id];
    writeJson(_OPEN_TABS_KEY, openTabs);
    writeJson(_ACTIVE_DOC_KEY, id);
    set({ openTabs, activeDocId: id });
    const stored = readJson<StoredDoc | null>(docStorageKey(id), null);
    const nodes = stored?.nodes ?? [];
    useOutlineStore.setState({
      nodes,
      selectedId: nodes[0]?.id ?? null,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: nodes[0]?.id ?? null
    });
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
    const openTabs = get().openTabs.filter((t) => t !== id);
    writeJson(_OPEN_TABS_KEY, openTabs);
    let activeDocId = get().activeDocId;
    if (activeDocId === id) {
      activeDocId = openTabs[openTabs.length - 1] ?? null;
      writeJson(_ACTIVE_DOC_KEY, activeDocId);
      if (activeDocId) {
        const stored = readJson<StoredDoc | null>(docStorageKey(activeDocId), null);
        const nodes = stored?.nodes ?? [];
        useOutlineStore.setState({
          nodes,
          selectedId: nodes[0]?.id ?? null,
          editingId: null,
          multiSelectedIds: [],
          selectionAnchorId: nodes[0]?.id ?? null
        });
      } else {
        useOutlineStore.setState({ nodes: [], selectedId: null, editingId: null, multiSelectedIds: [], selectionAnchorId: null });
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
    let activeDocId = get().activeDocId;
    if (activeDocId === id) {
      activeDocId = openTabs[openTabs.length - 1] ?? null;
      writeJson(_ACTIVE_DOC_KEY, activeDocId);
      if (activeDocId) {
        const stored = readJson<StoredDoc | null>(docStorageKey(activeDocId), null);
        useOutlineStore.setState({ nodes: stored?.nodes ?? [] });
      } else {
        useOutlineStore.setState({ nodes: [] });
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
  }
}));
