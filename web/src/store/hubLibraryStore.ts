import { create } from 'zustand';

export interface LibraryItem {
  id: number;
  title: string;
  url: string;
  description: string;
}

interface HubLibraryState {
  items: LibraryItem[];
  nextId: number;
  addItem: (title: string, url: string, description: string) => void;
  removeItem: (id: number) => void;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Library. Fresh, minimal CRUD list of
 * reference items (title, URL, description) -- no ported core logic exists for this tab, same
 * category as Hub Meeting Notes and Pad's Decision Log/Q&A/Remarks before it. In-memory only,
 * no persistence layer yet, same deferred-follow-up reasoning as Meeting Notes.
 */
export const useHubLibraryStore = create<HubLibraryState>((set, get) => ({
  items: [],
  nextId: 1,

  addItem: (title, url, description) => {
    const { items, nextId } = get();
    set({ items: [...items, { id: nextId, title, url, description }], nextId: nextId + 1 });
  },

  removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) })
}));
