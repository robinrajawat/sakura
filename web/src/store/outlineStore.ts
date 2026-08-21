import { create } from 'zustand';
import {
  indentRootIndexes,
  outdentRootIndexes,
  canIndentAt,
  moveNodeBlockCore,
  type DropMode
} from '../core/nodeMutations';
import { getIndex } from '../core/nodeQueries';
import { rebuildParentIdsCore, type ParentLinkedNode } from '../core/nodeSelection';

/**
 * Phase 0 validation spike (docs/framework-migration-plan.md) — NOT the real outline store.
 * Its only job is proving the React+Zustand+ported-core-logic combination works for the
 * single riskiest slice of the whole app: the outline tree (render, select, indent/outdent,
 * drag reorder). Deliberately scoped down from the real app's needs:
 *   - Single selection only (selectedId), no multi-select/range-select — the real app's
 *     computeSelectedIds/computeSelectionRootIndexes handle that, and porting the full
 *     multi-select UI is Phase 2's job, not this spike's.
 *   - No undo/redo, no persistence, no collapse/fold — a seeded in-memory tree is enough to
 *     validate the mutation plumbing itself.
 *   - Drag reorder supports 'above'/'below' only, not 'child' (nesting via drag) — the ported
 *     moveNodeBlockCore already supports 'child' and 'end' too; this spike just doesn't wire
 *     a UI affordance for them yet (see OutlineTree.tsx's own comment on this).
 */

function seedNodes(): ParentLinkedNode[] {
  const raw: Array<{ id: number; depth: number; text: string }> = [
    { id: 1, depth: 0, text: 'Welcome to the Sakura web spike' },
    { id: 2, depth: 1, text: 'This tree is wired to the real ported core logic' },
    { id: 3, depth: 2, text: 'nodeMutations.ts — indent/outdent/move, byte-identical to legacy' },
    { id: 4, depth: 2, text: 'nodeQueries.ts — the same tree-query functions legacy uses' },
    { id: 5, depth: 1, text: 'Try it — click a row, then Tab / Shift+Tab' },
    { id: 6, depth: 1, text: 'Drag a row onto another to reorder it' },
    { id: 7, depth: 2, text: 'Drop on the top half to go above, bottom half to go below' }
  ];
  const nodes: ParentLinkedNode[] = raw.map((n) => ({ ...n, parentId: null }));
  rebuildParentIdsCore(nodes);
  return nodes;
}

interface OutlineState {
  nodes: ParentLinkedNode[];
  selectedId: number | null;
  selectNode: (id: number) => void;
  indentSelected: () => void;
  outdentSelected: () => void;
  canIndentSelected: () => boolean;
  moveNode: (draggedId: number, targetId: number, mode: DropMode) => boolean;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: seedNodes(),
  selectedId: 1,

  selectNode: (id) => set({ selectedId: id }),

  indentSelected: () => {
    const { nodes, selectedId } = get();
    if (selectedId === null) return;
    const idx = getIndex(nodes, selectedId);
    if (idx < 0 || !canIndentAt(nodes, idx)) return;
    const next = nodes.map((n) => ({ ...n }));
    indentRootIndexes(next, [idx]);
    rebuildParentIdsCore(next);
    set({ nodes: next });
  },

  outdentSelected: () => {
    const { nodes, selectedId } = get();
    if (selectedId === null) return;
    const idx = getIndex(nodes, selectedId);
    if (idx < 0) return;
    const next = nodes.map((n) => ({ ...n }));
    outdentRootIndexes(next, [idx]);
    rebuildParentIdsCore(next);
    set({ nodes: next });
  },

  canIndentSelected: () => {
    const { nodes, selectedId } = get();
    if (selectedId === null) return false;
    const idx = getIndex(nodes, selectedId);
    return idx >= 0 && canIndentAt(nodes, idx);
  },

  moveNode: (draggedId, targetId, mode) => {
    const { nodes } = get();
    const next = nodes.map((n) => ({ ...n }));
    const moved = moveNodeBlockCore(next, draggedId, targetId, mode);
    if (!moved) return false;
    rebuildParentIdsCore(next);
    set({ nodes: next });
    return true;
  }
}));
