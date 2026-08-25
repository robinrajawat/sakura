import { create } from 'zustand';

/**
 * §6.7 slice (docs/phase6-full-parity-plan.md): the per-node "deviates from the document-wide
 * inline-preview default" tracking for note/remark/Q&A previews in the live outline tree --
 * matches legacy's own real `inlineExpandNoteNodeIds`/`inlineExpandRemarksNodeIds`/
 * `inlineExpandQaNodeIds` (legacy/index.html:8276) exactly, including being session-only: these
 * Sets are never persisted to `localStorage` or the document itself (legacy's own comment at
 * 18272-18274 says so explicitly -- "these aren't persisted (session-only)"), same reasoning
 * `notePanelStore.ts` uses for its own transient UI state. Resolving a Set's membership into an
 * actual on/off state for a given node is `state/inlineExpand.ts`'s `isInlineExpanded` -- see
 * that file's own header for the XOR-against-the-live-default semantics this store's callers
 * need to know about.
 */
interface InlineExpandState {
  noteExpandIds: Set<number>;
  remarkExpandIds: Set<number>;
  qaExpandIds: Set<number>;
  toggleNoteExpand: (nodeId: number) => void;
  toggleRemarkExpand: (nodeId: number) => void;
  toggleQaExpand: (nodeId: number) => void;
}

function toggled(current: Set<number>, id: number): Set<number> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export const useInlineExpandStore = create<InlineExpandState>((set, get) => ({
  noteExpandIds: new Set(),
  remarkExpandIds: new Set(),
  qaExpandIds: new Set(),
  toggleNoteExpand: (nodeId) => set({ noteExpandIds: toggled(get().noteExpandIds, nodeId) }),
  toggleRemarkExpand: (nodeId) => set({ remarkExpandIds: toggled(get().remarkExpandIds, nodeId) }),
  toggleQaExpand: (nodeId) => set({ qaExpandIds: toggled(get().qaExpandIds, nodeId) })
}));
