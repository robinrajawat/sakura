import { create } from 'zustand';
import {
  normalizeLibraryItemCore,
  loadLibraryLocalCore,
  saveLibraryItemsCore,
  sortLibraryItemsCore,
  initHubLibraryState,
  type LibraryItem
} from '../state/hubLibrary';
import { generateId } from '../utils/generateId';

// Real dependencies for the ported hubLibrary.ts core. idbGet/idbSet are the same
// localStorage-backed Promise shim hubJournalStore.ts/hubMeetingsStore.ts use (no real
// IndexedDB exists in web/ yet -- see those files' own headers). Cloud sync hooks are no-ops,
// same "no backend exists yet" reasoning as every other Hub store.
initHubLibraryState({
  idbGet: (key) =>
    Promise.resolve().then(() => {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    }),
  idbSet: (key, value) =>
    Promise.resolve()
      .then(() => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
        return true;
      })
      .catch(() => false),
  bumpSyncTimestamp: () => {},
  pushMetaToCloud: () => {},
  now: () => Date.now(),
  generateLibraryId: () => generateId('lib')
});

interface HubLibraryState {
  items: LibraryItem[];
  loaded: boolean;
  // The currently open single-entry card's id, or null for the list view -- matches legacy's
  // own libraryExpandedId (legacy/index.html:49299).
  expandedId: string | null;
  searchQuery: string;
  tagFilter: string | null;
  favoritesOnly: boolean;

  load: () => Promise<void>;
  openItem: (id: string) => void;
  closeItem: () => void;
  createItem: () => void;
  deleteItem: (id: string) => void;
  updateField: (id: string, patch: Partial<Pick<LibraryItem, 'title' | 'url' | 'urlLabel' | 'body'>>) => void;
  toggleFavorite: (id: string) => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;

  setSearchQuery: (q: string) => void;
  setTagFilter: (tag: string) => void;
  setFavoritesOnly: (on: boolean) => void;
}

function touch(items: LibraryItem[], id: string, patch: Partial<LibraryItem>): LibraryItem[] {
  return items.map((it) => (it.id === id ? { ...it, ...patch, modifiedAt: Date.now() } : it));
}

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md): Hub Library, replacing the Phase 4
 * placeholder (freeform title/url/description CRUD) with legacy's real model -- persistence,
 * a rich-text body, tags, favorites, search, and a tag filter, all matching `hubLibrary.ts`'s
 * own `normalizeLibraryItemCore`. See that file's own header for the full scoping, including
 * why AI rewrite/Version History/PDF export/Quick-Assist-visibility stay out of scope.
 *
 * `setTagFilter` toggles: clicking the already-active filter tag clears it, matching legacy's
 * own `setLibraryTagFilter` exactly (legacy/index.html:49448-49451).
 */
export const useHubLibraryStore = create<HubLibraryState>((set, get) => ({
  items: [],
  loaded: false,
  expandedId: null,
  searchQuery: '',
  tagFilter: null,
  favoritesOnly: false,

  load: async () => {
    if (get().loaded) return;
    const items = await loadLibraryLocalCore();
    set({ items, loaded: true });
  },

  openItem: (id) => set({ expandedId: id }),
  closeItem: () => set({ expandedId: null }),

  createItem: () => {
    const item = normalizeLibraryItemCore({});
    const items = [...get().items, item];
    set({ items, expandedId: item.id });
    saveLibraryItemsCore(items);
  },

  deleteItem: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    set({ items, expandedId: get().expandedId === id ? null : get().expandedId });
    saveLibraryItemsCore(items);
  },

  updateField: (id, patch) => {
    const items = touch(get().items, id, patch);
    set({ items });
    saveLibraryItemsCore(items);
  },

  toggleFavorite: (id) => {
    const current = get().items.find((i) => i.id === id);
    if (!current) return;
    const items = touch(get().items, id, { favorite: !current.favorite });
    set({ items });
    saveLibraryItemsCore(items);
  },

  addTag: (id, tag) => {
    const trimmed = tag.trim().replace(/^#/, '');
    if (!trimmed) return;
    const current = get().items.find((i) => i.id === id);
    if (!current || current.tags.includes(trimmed)) return;
    const items = touch(get().items, id, { tags: [...current.tags, trimmed] });
    set({ items });
    saveLibraryItemsCore(items);
  },

  removeTag: (id, tag) => {
    const current = get().items.find((i) => i.id === id);
    if (!current) return;
    const items = touch(get().items, id, { tags: current.tags.filter((t) => t !== tag) });
    set({ items });
    saveLibraryItemsCore(items);
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setTagFilter: (tag) => set({ tagFilter: get().tagFilter === tag ? null : tag }),
  setFavoritesOnly: (on) => set({ favoritesOnly: on })
}));

export { sortLibraryItemsCore };
