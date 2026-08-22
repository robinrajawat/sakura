import { create } from 'zustand';
import {
  indentRootIndexes,
  outdentRootIndexes,
  canIndentAt,
  moveNodeBlockCore,
  insertParsedNodesCore,
  deleteRootIndexes,
  type DropMode
} from '../core/nodeMutations';
import { getIndex, nodeHasChildren, getVisibleNodeIndexes } from '../core/nodeQueries';
import { rebuildParentIdsCore, type ParentLinkedNode } from '../core/nodeSelection';

/**
 * Phase 0 validation spike, now carrying Phase 2's first slice (docs/framework-migration-plan.md)
 * — still not the real outline store (no undo/redo, no persistence, no multi-select), but no
 * longer just a validation exercise either: real create/edit/delete and fold/collapse, wired to
 * the same ported core logic as before, plus the ported `getVisibleNodeIndexes` for fold-aware
 * rendering.
 *
 * Node id generation deliberately does NOT reuse `generateId()` from utils/generateId.ts — that
 * produces string ids for documents/templates/meeting notes, a completely different id
 * namespace. Outline node ids are numeric, generated via a simple incrementing counter — the
 * same role legacy's hand-written `makeNode()` (`id: nextId++`) plays, per templatesApply.ts's
 * own header comment explaining why `makeNode` itself was never extracted as core logic (it's
 * orchestration/construction, not a pure query/mutation), so this store's own `nextId` counter
 * is the correct, expected place for that responsibility to live now.
 */

function seedNodes(): ParentLinkedNode[] {
  const raw: Array<{ id: number; depth: number; text: string }> = [
    { id: 1, depth: 0, text: 'Welcome to the Sakura web spike' },
    { id: 2, depth: 1, text: 'This tree is wired to the real ported core logic' },
    { id: 3, depth: 2, text: 'nodeMutations.ts — indent/outdent/move, byte-identical to legacy' },
    { id: 4, depth: 2, text: 'nodeQueries.ts — the same tree-query functions legacy uses' },
    { id: 5, depth: 1, text: 'Try it — click a row, then Tab / Shift+Tab' },
    { id: 6, depth: 1, text: 'Drag a row onto another to reorder it' },
    { id: 7, depth: 2, text: 'Drop on the top half to go above, bottom half to go below' },
    { id: 8, depth: 1, text: 'Enter creates a sibling, Ctrl/Cmd+Enter creates a child' },
    { id: 9, depth: 1, text: 'Click the fold arrow to collapse/expand a subtree' },
    { id: 10, depth: 2, text: 'Backspace on empty text deletes the node' },
    {
      id: 11,
      depth: 1,
      text: '[Semantic markup] now renders `like this` for code and !urgent for alerts (matches legacy exactly)'
    }
  ];
  const nodes: ParentLinkedNode[] = raw.map((n) => ({ ...n, parentId: null }));
  rebuildParentIdsCore(nodes);
  return nodes;
}

const SEED_MAX_ID = 11;

interface OutlineState {
  nodes: ParentLinkedNode[];
  selectedId: number | null;
  editingId: number | null;
  collapsedIds: Set<number>;
  nextId: number;

  selectNode: (id: number) => void;
  indentSelected: () => void;
  outdentSelected: () => void;
  canIndentSelected: () => boolean;
  moveNode: (draggedId: number, targetId: number, mode: DropMode) => boolean;

  visibleIndexes: () => number[];
  nodeHasChildren: (id: number) => boolean;

  startEditing: (id: number) => void;
  commitEdit: (id: number, text: string) => void;
  cancelEdit: () => void;

  newSiblingBelow: (id: number) => void;
  newChild: (id: number) => void;
  deleteNode: (id: number) => void;

  toggleCollapse: (id: number) => void;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: seedNodes(),
  selectedId: 1,
  editingId: null,
  collapsedIds: new Set(),
  nextId: SEED_MAX_ID + 1,

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
  },

  visibleIndexes: () => {
    const { nodes, collapsedIds } = get();
    return getVisibleNodeIndexes(nodes, collapsedIds);
  },

  nodeHasChildren: (id) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    return idx >= 0 && nodeHasChildren(nodes, idx);
  },

  startEditing: (id) => set({ selectedId: id, editingId: id }),

  commitEdit: (id, text) => {
    const { nodes } = get();
    const next = nodes.map((n) => (n.id === id ? { ...n, text } : n));
    set({ nodes: next, editingId: null });
  },

  cancelEdit: () => set({ editingId: null }),

  newSiblingBelow: (id) => {
    const { nodes, nextId } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    const next = nodes.map((n) => ({ ...n }));
    const newNode: ParentLinkedNode = { id: nextId, depth: nodes[idx].depth, text: '', parentId: null };
    insertParsedNodesCore(next, idx, [newNode]);
    rebuildParentIdsCore(next);
    set({ nodes: next, nextId: nextId + 1, selectedId: newNode.id, editingId: newNode.id });
  },

  newChild: (id) => {
    const { nodes, nextId } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    const next = nodes.map((n) => ({ ...n }));
    const newNode: ParentLinkedNode = { id: nextId, depth: nodes[idx].depth + 1, text: '', parentId: null };
    insertParsedNodesCore(next, idx, [newNode]);
    rebuildParentIdsCore(next);
    set({ nodes: next, nextId: nextId + 1, selectedId: newNode.id, editingId: newNode.id, collapsedIds: withoutCollapse(get().collapsedIds, id) });
  },

  deleteNode: (id) => {
    const { nodes } = get();
    if (nodes.length <= 1) return;
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    // Select whatever comes right before the deleted node in document order, or the next
    // remaining node if it was first — a reasonable, simple choice for this slice; the real
    // app's own delete-selection logic (nearest visible neighbor, respecting fold state) is
    // more nuanced and deferred, same as multi-select delete (deleteRootIndexes already
    // supports multiple root indexes at once — this wrapper only ever passes a single one
    // for now).
    const next = nodes.map((n) => ({ ...n }));
    deleteRootIndexes(next, [idx]);
    rebuildParentIdsCore(next);
    const fallbackSelection = idx > 0 ? nodes[idx - 1].id : next[0]?.id ?? null;
    set({ nodes: next, selectedId: fallbackSelection, editingId: null });
  },

  toggleCollapse: (id) => {
    const { collapsedIds } = get();
    const next = new Set(collapsedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ collapsedIds: next });
  }
}));

function withoutCollapse(collapsedIds: Set<number>, id: number): Set<number> {
  if (!collapsedIds.has(id)) return collapsedIds;
  const next = new Set(collapsedIds);
  next.delete(id);
  return next;
}

