import { create } from 'zustand';
import {
  indentRootIndexes,
  outdentRootIndexes,
  canIndentAt,
  moveNodeBlockCore,
  moveMultipleNodeBlocksCore,
  insertParsedNodesCore,
  deleteRootIndexes,
  sortChildBlocksCore,
  type DropMode,
  type SortMode
} from '../core/nodeMutations';
import { getIndex, nodeHasChildren, getVisibleNodeIndexes, getSelectionRangeIds } from '../core/nodeQueries';
import {
  rebuildParentIdsCore,
  computeSelectedIds,
  computeSelectionRootIndexes,
  type ParentLinkedNode
} from '../core/nodeSelection';

/**
 * Phase 0 validation spike, carrying Phase 2's first three slices (create/edit/delete+fold,
 * semantic markup, drag-to-nest) plus this slice: multi-select (docs/framework-migration-plan.md).
 * Still not the real outline store (no undo/redo, no persistence), but `multiSelectedIds` +
 * `selectionAnchorId` now exist and are wired the same way legacy's own row click handler
 * (index.html) drives them — Shift-click extends a range from the anchor via the ported
 * `getSelectionRangeIds`, Ctrl/Cmd-click toggles membership (collapsing back to a plain single
 * selection once 0-1 ids remain, matching legacy exactly), plain click resets to a single
 * selection and re-anchors. `computeSelectedIds`/`computeSelectionRootIndexes` (ported to
 * nodeSelection.ts in Phase 1, unused until now) are what indent/outdent/delete key off of, so
 * those three actions now operate over the whole selection, not just `selectedId`. Multi-drag
 * (dragging 2+ selected rows together) reuses the ported `moveMultipleNodeBlocksCore`, following
 * the same selection-collapsing-to-a-single-node-post-move behavior legacy's own
 * `moveMultipleNodeBlocks` wrapper has. `selectAllMode` itself (the "select every node" case
 * `computeSelectedIds` also branches on) is intentionally NOT wired yet — no keyboard shortcut
 * or UI entry point for it in this slice; every call site below passes `false`, matching the
 * currently-always-false actual state of that flag.
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
  multiSelectedIds: number[];
  selectionAnchorId: number | null;

  selectNode: (id: number) => void;
  clickNode: (id: number, modifiers: { shiftKey?: boolean; ctrlKey?: boolean }) => void;
  selectedIds: () => number[];
  selectionRootIndexes: () => number[];
  indentSelected: () => void;
  outdentSelected: () => void;
  canIndentSelected: () => boolean;
  moveNode: (draggedId: number, targetId: number, mode: DropMode, draggedIds?: number[]) => boolean;

  visibleIndexes: () => number[];
  nodeHasChildren: (id: number) => boolean;

  startEditing: (id: number) => void;
  commitEdit: (id: number, text: string) => void;
  cancelEdit: () => void;

  newSiblingBelow: (id: number) => void;
  newChild: (id: number) => void;
  splitAtCursor: (id: number, fullText: string, caretPos: number) => void;
  deleteNode: (id: number) => void;
  deleteSelected: () => void;
  sortChildren: (parentId: number | null, mode: SortMode) => boolean;

  toggleCollapse: (id: number) => void;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: seedNodes(),
  selectedId: 1,
  editingId: null,
  collapsedIds: new Set(),
  nextId: SEED_MAX_ID + 1,
  multiSelectedIds: [],
  selectionAnchorId: 1,

  selectNode: (id) => set({ selectedId: id, multiSelectedIds: [], selectionAnchorId: id }),

  clickNode: (id, { shiftKey, ctrlKey }) => {
    const { nodes, collapsedIds, multiSelectedIds, selectedId, selectionAnchorId } = get();
    if (shiftKey) {
      const anchor = selectionAnchorId ?? selectedId ?? id;
      const range = getSelectionRangeIds(nodes, collapsedIds, anchor, id).filter(
        (rid): rid is number => rid !== null
      );
      set({ multiSelectedIds: range, selectedId: id });
      return;
    }
    if (ctrlKey) {
      const base = new Set(multiSelectedIds.length ? multiSelectedIds : selectedId !== null ? [selectedId] : []);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      // Re-derive in document order, same convention as legacy's own toggle handler, rather
      // than accumulating in click order.
      const nextMulti = nodes.map((n) => n.id).filter((nid) => base.has(nid));
      if (nextMulti.length <= 1) {
        const remaining = nextMulti[0] ?? id;
        set({ selectedId: remaining, multiSelectedIds: [], selectionAnchorId: remaining });
      } else {
        set({ multiSelectedIds: nextMulti, selectedId: id, selectionAnchorId: id });
      }
      return;
    }
    set({ selectedId: id, multiSelectedIds: [], selectionAnchorId: id });
  },

  selectedIds: () => {
    const { nodes, multiSelectedIds, selectedId } = get();
    return computeSelectedIds(nodes, false, multiSelectedIds, selectedId);
  },

  selectionRootIndexes: () => {
    const { nodes } = get();
    return computeSelectionRootIndexes(nodes, get().selectedIds());
  },

  indentSelected: () => {
    const { nodes } = get();
    const roots = get().selectionRootIndexes();
    if (!roots.length || roots.some((idx) => !canIndentAt(nodes, idx))) return;
    const next = nodes.map((n) => ({ ...n }));
    indentRootIndexes(next, roots);
    rebuildParentIdsCore(next);
    set({ nodes: next });
  },

  outdentSelected: () => {
    const { nodes } = get();
    const roots = get().selectionRootIndexes();
    if (!roots.length || roots.every((idx) => nodes[idx].depth === 0)) return;
    const next = nodes.map((n) => ({ ...n }));
    outdentRootIndexes(next, roots);
    rebuildParentIdsCore(next);
    set({ nodes: next });
  },

  canIndentSelected: () => {
    const { nodes, selectedId } = get();
    if (selectedId === null) return false;
    const idx = getIndex(nodes, selectedId);
    return idx >= 0 && canIndentAt(nodes, idx);
  },

  moveNode: (draggedId, targetId, mode, draggedIds) => {
    const { nodes, collapsedIds } = get();
    const next = nodes.map((n) => ({ ...n }));
    // Nesting under a collapsed target would hide the arriving node(s) immediately — same
    // un-collapse-on-arrival behavior newChild already uses.
    const nextCollapsed = mode === 'child' ? withoutCollapse(collapsedIds, targetId) : collapsedIds;

    if (draggedIds && draggedIds.length > 1) {
      const survivingIds = moveMultipleNodeBlocksCore(next, draggedIds, targetId, mode);
      if (!survivingIds) return false;
      rebuildParentIdsCore(next);
      // Matches legacy's own moveMultipleNodeBlocks wrapper: the selection collapses to the
      // surviving multi-selection, anchored/selected on the first originally-dragged id.
      set({
        nodes: next,
        collapsedIds: nextCollapsed,
        selectedId: draggedIds[0],
        selectionAnchorId: draggedIds[0],
        multiSelectedIds: survivingIds
      });
      return true;
    }

    const moved = moveNodeBlockCore(next, draggedId, targetId, mode);
    if (!moved) return false;
    rebuildParentIdsCore(next);
    // Matches legacy's own moveNodeBlock wrapper: a single-node drag always resolves to a
    // plain single selection on the node that moved, clearing any stale multi-selection.
    set({
      nodes: next,
      collapsedIds: nextCollapsed,
      selectedId: draggedId,
      selectionAnchorId: draggedId,
      multiSelectedIds: []
    });
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

  startEditing: (id) => set({ selectedId: id, editingId: id, multiSelectedIds: [], selectionAnchorId: id }),

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
    set({
      nodes: next,
      nextId: nextId + 1,
      selectedId: newNode.id,
      editingId: newNode.id,
      multiSelectedIds: [],
      selectionAnchorId: newNode.id
    });
  },

  newChild: (id) => {
    const { nodes, nextId } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    const next = nodes.map((n) => ({ ...n }));
    const newNode: ParentLinkedNode = { id: nextId, depth: nodes[idx].depth + 1, text: '', parentId: null };
    insertParsedNodesCore(next, idx, [newNode]);
    rebuildParentIdsCore(next);
    set({
      nodes: next,
      nextId: nextId + 1,
      selectedId: newNode.id,
      editingId: newNode.id,
      collapsedIds: withoutCollapse(get().collapsedIds, id),
      multiSelectedIds: [],
      selectionAnchorId: newNode.id
    });
  },

  // Splits a node's text at the cursor: the text before the caret stays on this node, the text
  // after it becomes a new sibling inserted right after this node's whole subtree (matching
  // legacy's own splitNodeAtCursor exactly) -- keyed off the plain <input>'s native
  // `selectionStart`, not a rich-text cursor tracker; a plain HTML input already exposes this,
  // so no new core logic is needed here beyond composing insertParsedNodesCore the same way
  // newSiblingBelow already does. `fullText` is the input's live (uncommitted) value at the
  // moment Shift+Enter fires, since our inline-edit <input> is uncontrolled and only commits to
  // `nodes` on blur/Enter/Escape -- passing it explicitly avoids reading stale node.text.
  splitAtCursor: (id, fullText, caretPos) => {
    const { nodes, nextId } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    const pos = Math.max(0, Math.min(caretPos, fullText.length));
    const before = fullText.slice(0, pos);
    const after = fullText.slice(pos);
    const next = nodes.map((n) => ({ ...n }));
    next[idx] = { ...next[idx], text: before };
    const newNode: ParentLinkedNode = { id: nextId, depth: next[idx].depth, text: after, parentId: null };
    insertParsedNodesCore(next, idx, [newNode]);
    rebuildParentIdsCore(next);
    set({
      nodes: next,
      nextId: nextId + 1,
      selectedId: newNode.id,
      editingId: newNode.id,
      multiSelectedIds: [],
      selectionAnchorId: newNode.id
    });
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
    set({
      nodes: next,
      selectedId: fallbackSelection,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: fallbackSelection
    });
  },

  // Deletes every root of the current selection (single or multi) at once — the Delete-key
  // counterpart to deleteNode's single-node Backspace-on-empty-text flow. Mirrors legacy's own
  // deleteSelected: no "refuse to delete the last node" guard here (that guard is specific to
  // deleteNode's single-node wrapper); selecting and deleting every node is allowed, same as
  // legacy, leaving an empty tree.
  deleteSelected: () => {
    const { nodes } = get();
    const roots = get().selectionRootIndexes();
    if (!roots.length) return;
    const next = nodes.map((n) => ({ ...n }));
    deleteRootIndexes(next, roots);
    rebuildParentIdsCore(next);
    const fallbackIdx = Math.min(roots[0], Math.max(0, next.length - 1));
    const fallbackSelection = next[fallbackIdx]?.id ?? next[next.length - 1]?.id ?? null;
    set({
      nodes: next,
      selectedId: fallbackSelection,
      editingId: null,
      multiSelectedIds: [],
      selectionAnchorId: fallbackSelection
    });
  },

  // Reorders the immediate child blocks under `parentId` (or every top-level root block, if
  // `parentId` is `null`) via the freshly-written `sortChildBlocksCore` (see that function's
  // own header — sortChildBlocks was never one of legacy's extracted `src/core/` generated
  // blocks, so this isn't a Phase 1 port). Only the toolbar-level "sort top-level nodes" entry
  // point is wired up in this slice (parentId always null from the UI below) — legacy also
  // exposes a per-node "sort this node's children" action from its context menu, deferred here
  // since web/ has no context-menu affordance yet at all, not specific to sorting.
  sortChildren: (parentId, mode) => {
    const { nodes } = get();
    const parentIdx = parentId === null ? null : getIndex(nodes, parentId);
    if (parentIdx !== null && parentIdx < 0) return false;
    const next = nodes.map((n) => ({ ...n }));
    const sorted = sortChildBlocksCore(next, parentIdx, mode);
    if (!sorted) return false;
    rebuildParentIdsCore(next);
    set({ nodes: next });
    return true;
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

