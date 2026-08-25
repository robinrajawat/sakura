import { create } from 'zustand';

/**
 * Transient UI state for the Suggest-icon picker popover (§6.9 slice 7, docs/phase6-full-parity-
 * plan.md) — which node (if any) currently has a picker open, and what candidates it's showing.
 * A small dedicated store rather than component-local state because both the toolbar button
 * (`App.tsx`) and the right-click "Suggest icon" entry (`OutlineTree.tsx`) need to open the same
 * picker, and `OutlineTree.tsx` takes no props at all (same "everything through stores, no prop
 * drilling" convention `sidebarStore.ts`/`inlineExpandStore.ts` already establish for this kind of
 * cross-component transient UI state). Session-only, not persisted — matches `tabViewCache`'s own
 * in-memory-only precedent for state that only matters while the app is open.
 */
interface IconPickerState {
  nodeId: number | null;
  candidates: string[];
  open: (nodeId: number, candidates: string[]) => void;
  close: () => void;
}

export const useIconPickerStore = create<IconPickerState>((set) => ({
  nodeId: null,
  candidates: [],
  open: (nodeId, candidates) => set({ nodeId, candidates }),
  close: () => set({ nodeId: null, candidates: [] })
}));
