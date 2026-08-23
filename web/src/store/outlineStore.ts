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
  toggleCheckboxCore,
  type DropMode,
  type SortMode
} from '../core/nodeMutations';
import {
  getIndex,
  nodeHasChildren,
  getVisibleNodeIndexes,
  getSelectionRangeIds,
  getSubtreeEnd,
  getParentIndex,
  type CheckboxNode
} from '../core/nodeQueries';
import {
  rebuildParentIdsCore,
  computeSelectedIds,
  computeSelectionRootIndexes,
  type ParentLinkedNode
} from '../core/nodeSelection';

/** The real outline node shape this store works with: parent-linked (nodeSelection.ts) plus
 * checkbox-aware (nodeQueries.ts's `CheckboxNode`) — every node carries both sets of fields
 * regardless of whether it's actually used as a checkbox, same as legacy's own
 * always-populated `normalizeNode` output (see toggleCheckbox's own comment below). */
export interface CodeBlock {
  lang: string;
  code: string;
}

export interface OutlineNode extends ParentLinkedNode, CheckboxNode {
  note: string;
  codeBlock: CodeBlock | null;
  /** `#tags` attached to this node (Tags & Focus slice). Plain string array, matching legacy's
   * own per-node `tags` field shape -- deliberately flat, no hierarchy/nesting/color-per-tag
   * yet (README describes richer tag chrome this doesn't attempt). Read/write, not just
   * preserved-as-unknown, in docSyncStore.ts's cloud round-trip (see that file's own header). */
  tags: string[];
}

export const CODE_LANGS = ['plain', 'abap', 'sql', 'javascript', 'python', 'json', 'markup', 'markdown'];

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

function seedNodes(): OutlineNode[] {
  // A single blank starter node -- deliberately NOT dev/spike content. This is outlineStore's
  // in-memory default before documentsStore.init() (documentsStore.ts) runs and either loads a
  // real persisted document or creates a proper first document of its own; documentsStore's
  // init() no longer blindly adopts whatever's sitting here (see that function's own comment
  // for why), but keeping this harmless-if-briefly-visible matters regardless, since a
  // standalone consumer of outlineStore (tests, or any future entry point that doesn't route
  // through documentsStore) would otherwise show real users placeholder tutorial text again.
  const nodes: OutlineNode[] = [
    { id: 1, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }
  ];
  rebuildParentIdsCore(nodes);
  return nodes;
}

const SEED_MAX_ID = 1;

/** Phase 6.2 (docs/phase6-full-parity-plan.md's 6.2 section: "Undo/redo (foundational)"), a
 * store-level absence named explicitly in that plan and docs/history/phase5-parity-checklist.md's own
 * Documents & Tabs / Keyboard Shortcuts gaps. Matches legacy's own real snapshot shape and
 * mechanics closely (legacy/index.html:9806-9819's `snapshot`/`restoreFromSnapshot`/`pushUndo`/
 * `undo`/`redo`), with one deliberate difference: legacy's `snapshot()` also bundles
 * `currentTheme`/`currentFont`/`remarks`/`qaItems` into the SAME undo stack as the outline.
 * Reverting your theme/font choice as a side effect of undoing an outline edit is surprising, not
 * a feature worth replicating, and `remarks`/`qaItems` live in a completely different store here
 * (padStore.ts) -- bundling a cross-store snapshot into one undo action is a real, separately-
 * scoped feature (matching this plan's own framing: "`outlineStore.ts` has no undo/redo... not a
 * per-tab gap, a store-level absence" -- outlineStore's own content, not every store in the app).
 *
 * Snapshots are stored by REFERENCE, not a deep clone/JSON round-trip like legacy's own
 * `JSON.stringify`-based `snapshot()` -- safe here because every mutating action in this file
 * already rebuilds `nodes` (and every node object within it) fresh via `.map()` before mutating,
 * never mutating a previous array/object in place (verified across every action below). A
 * snapshot capturing "whatever `nodes` currently points to" can never be silently corrupted by a
 * later mutation, since that later mutation always produces a NEW array rather than touching the
 * one a snapshot is holding onto.
 */
export interface UndoSnapshot {
  nodes: OutlineNode[];
  nextId: number;
  selectedId: number | null;
  multiSelectedIds: number[];
  selectionAnchorId: number | null;
  focusedId: number | null;
}
const UNDO_LIMIT = 200; // matches legacy/index.html:9817's own cap exactly

interface OutlineState {
  nodes: OutlineNode[];
  selectedId: number | null;
  editingId: number | null;
  collapsedIds: Set<number>;
  nextId: number;
  multiSelectedIds: number[];
  selectionAnchorId: number | null;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];

  /** Tags & Focus mode slice (docs/phase5-parity-checklist.md, "Tags, Focus & Backlinks").
   * `activeTagFilter`: when set, `visibleIndexes()` restricts to nodes carrying that tag, as a
   * flat list -- deliberately no ancestor-context breadcrumbing in this first pass, same
   * "honest first pass" scoping every other Phase 3/4/5 slice in this project uses (see e.g.
   * Pad/Hub's own header comments for the same pattern). `focusedId`: when set, `visibleIndexes()`
   * restricts to that node's own subtree (via `getSubtreeEnd`), for a "zoom in" experience.
   * Focus and tag-filter can theoretically both be active at once; focus's subtree scoping is
   * applied first, then the tag filter narrows within it -- not a combination the UI in this
   * slice actually exposes a way to reach yet, but the store supports it correctly regardless. */
  activeTagFilter: string | null;
  focusedId: number | null;

  toggleTag: (id: number, tag: string) => void;
  setTagFilter: (tag: string | null) => void;
  zoomIntoNode: (id: number) => void;
  exitFocus: () => void;
  /** Ancestor chain from the root down to (not including) `focusedId` itself, for a breadcrumb
   * UI. Empty array when nothing is focused. */
  focusPath: () => OutlineNode[];

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
  toggleCheckbox: (id: number) => void;
  setNote: (id: number, note: string) => void;
  setCodeBlock: (id: number, codeBlock: CodeBlock | null) => void;

  toggleCollapse: (id: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useOutlineStore = create<OutlineState>((set, get) => {
  /** Snapshots the CURRENT state onto `undoStack` and clears `redoStack` -- call this BEFORE
   * applying a mutation, not after, matching legacy's own call-before-mutate convention
   * (legacy/index.html's own `pushUndo()` call sites: `pushUndo(); nodes[idx].text=...`, always
   * snapshot-then-mutate, never the reverse). Any new mutation invalidates the redo history the
   * same way legacy's own `pushUndo` does -- undoing, then making a fresh edit instead of
   * redoing, discards the "future" that edit replaced. */
  function pushUndo(): void {
    const s = get();
    const snap: UndoSnapshot = {
      nodes: s.nodes,
      nextId: s.nextId,
      selectedId: s.selectedId,
      multiSelectedIds: s.multiSelectedIds,
      selectionAnchorId: s.selectionAnchorId,
      focusedId: s.focusedId
    };
    const undoStack = [...s.undoStack, snap];
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    set({ undoStack, redoStack: [] });
  }

  /** Applies a popped snapshot to live state -- shared by `undo`/`redo` below, matching legacy's
   * own single shared `restoreFromSnapshot` (legacy/index.html:9816) used by both directions.
   * `nextId` only ever moves UP (`Math.max`), never down, even when restoring to an earlier
   * point in history -- matches legacy exactly and for the same reason: if it were rolled back
   * naively, a fresh `newSiblingBelow` after this undo (but before any redo) could mint an id
   * number that a still-redoable "future" snapshot also uses, corrupting that snapshot's node
   * identities the moment redo tried to bring it back. `selectedId`/`multiSelectedIds`/
   * `selectionAnchorId`/`focusedId` are all defensively re-validated against the snapshot's own
   * `nodes` (not the live pre-restore nodes) -- also matching legacy's own defensive filtering
   * in `restoreFromSnapshot`, though in practice every id in a snapshot was valid AT THE TIME it
   * was captured and stays that way, since the snapshot's `nodes` array is exactly what it was
   * when captured. */
  function applySnapshot(snap: UndoSnapshot): void {
    const idsInSnapshot = new Set(snap.nodes.map((n) => n.id));
    set({
      nodes: snap.nodes,
      nextId: Math.max(get().nextId, snap.nextId),
      selectedId: snap.selectedId !== null && idsInSnapshot.has(snap.selectedId) ? snap.selectedId : (snap.nodes[0]?.id ?? null),
      multiSelectedIds: snap.multiSelectedIds.filter((id) => idsInSnapshot.has(id)),
      selectionAnchorId:
        snap.selectionAnchorId !== null && idsInSnapshot.has(snap.selectionAnchorId) ? snap.selectionAnchorId : null,
      focusedId: snap.focusedId !== null && idsInSnapshot.has(snap.focusedId) ? snap.focusedId : null,
      // Never resume mid-inline-edit across an undo/redo -- same rationale as
      // documentsStore.ts's own TabViewState restore not resuming editingId across a tab switch,
      // and matches legacy's own restoreFromSnapshot setting editingId=null unconditionally.
      editingId: null
    });
  }

  return {
  undoStack: [],
  redoStack: [],
  nodes: seedNodes(),
  selectedId: 1,
  editingId: null,
  collapsedIds: new Set(),
  nextId: SEED_MAX_ID + 1,
  multiSelectedIds: [],
  selectionAnchorId: 1,
  activeTagFilter: null,
  focusedId: null,

  toggleTag: (id, tag) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    pushUndo();
    const next = nodes.map((n) => {
      if (n.id !== id) return n;
      const has = n.tags.includes(trimmed);
      return { ...n, tags: has ? n.tags.filter((t) => t !== trimmed) : [...n.tags, trimmed] };
    });
    set({ nodes: next });
  },

  setTagFilter: (tag) => set({ activeTagFilter: tag }),

  zoomIntoNode: (id) => {
    const { nodes } = get();
    if (getIndex(nodes, id) < 0) return;
    set({ focusedId: id });
  },

  exitFocus: () => set({ focusedId: null }),

  focusPath: () => {
    const { nodes, focusedId } = get();
    if (focusedId === null) return [];
    const path: OutlineNode[] = [];
    let idx = getIndex(nodes, focusedId);
    if (idx < 0) return [];
    idx = getParentIndex(nodes, idx);
    while (idx >= 0) {
      path.unshift(nodes[idx]);
      idx = getParentIndex(nodes, idx);
    }
    return path;
  },

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
    pushUndo();
    const next = nodes.map((n) => ({ ...n }));
    indentRootIndexes(next, roots);
    rebuildParentIdsCore(next);
    set({ nodes: next });
  },

  outdentSelected: () => {
    const { nodes } = get();
    const roots = get().selectionRootIndexes();
    if (!roots.length || roots.every((idx) => nodes[idx].depth === 0)) return;
    pushUndo();
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
      pushUndo();
      const survivingIds = moveMultipleNodeBlocksCore(next, draggedIds, targetId, mode);
      if (!survivingIds) {
        // The move didn't happen after all -- the pre-emptive pushUndo above would leave a
        // no-op snapshot on the stack (undoing it would restore the exact state already
        // current). Matches legacy's own handleDrop, which does the same
        // pushUndo()-then-undoStack.pop()-on-failure dance for the same reason.
        set({ undoStack: get().undoStack.slice(0, -1) });
        return false;
      }
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

    pushUndo();
    const moved = moveNodeBlockCore(next, draggedId, targetId, mode);
    if (!moved) {
      set({ undoStack: get().undoStack.slice(0, -1) });
      return false;
    }
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

  // Layers focus-subtree scoping and/or tag-filter scoping on top of the existing fold-aware
  // `getVisibleNodeIndexes` output -- post-hoc filtering, no core-layer (nodeQueries.ts/
  // nodeMutations.ts) changes needed, matching the "narrow, don't touch core" approach every
  // other store-level scoping decision in this file already uses (e.g. selectionRootIndexes).
  visibleIndexes: () => {
    const { nodes, collapsedIds, focusedId, activeTagFilter } = get();
    let indexes = getVisibleNodeIndexes(nodes, collapsedIds);

    if (focusedId !== null) {
      const focusIdx = getIndex(nodes, focusedId);
      if (focusIdx >= 0) {
        const end = getSubtreeEnd(nodes, focusIdx);
        // Subtree only, not the focused node's own row -- the breadcrumb (focusPath) is what
        // surfaces the focused node itself in the UI, same "zoom past it, don't re-show it"
        // convention as most outliner "zoom in" affordances.
        indexes = indexes.filter((idx) => idx > focusIdx && idx < end);
      } else {
        // Focused node no longer exists (deleted out from under an active focus) -- fail open
        // to the un-focused view rather than showing nothing.
        indexes = getVisibleNodeIndexes(nodes, collapsedIds);
      }
    }

    if (activeTagFilter !== null) {
      // Deliberately flat: filters straight to tagged nodes with no ancestor context restored,
      // same "honest first pass" scoping documented on activeTagFilter's own field comment
      // above -- a later slice can add breadcrumbed/tree-shaped filtering if that's wanted.
      indexes = indexes.filter((idx) => nodes[idx].tags.includes(activeTagFilter));
    }

    return indexes;
  },

  nodeHasChildren: (id) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    return idx >= 0 && nodeHasChildren(nodes, idx);
  },

  startEditing: (id) => set({ selectedId: id, editingId: id, multiSelectedIds: [], selectionAnchorId: id }),

  commitEdit: (id, text) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    // Auto-convert `[ ] text` / `[x] text` at commit time into a real checkbox node — matches
    // legacy's own autoConvertCheckboxSyntax exactly, including running unconditionally on
    // every commit (not just changed text) and stripping the marker from the stored text.
    const checkboxMatch = text.match(/^\[( |x)\]\s?(.*)$/i);
    // Matches legacy's own real optimization (legacy/index.html:19304-19307's own comment: "A
    // pure click-in/click-out or Escape-without-typing session no longer consumes an undo
    // slot"): only push a checkpoint when something is ABOUT to actually change, not on every
    // commit unconditionally. Our own architecture makes this simpler to check correctly than
    // legacy's -- our <input> is uncontrolled and never live-syncs into `nodes` during typing
    // (see splitAtCursor's own header comment), so comparing the newly-committed `text` against
    // the currently-STORED node.text is a valid, simple "did it change" check on its own; legacy
    // needed a separately-tracked `editSessionOriginalText` specifically because its own
    // node.text WAS live-synced on every keystroke, which would have made a naive comparison
    // here always look "changed".
    if (idx >= 0 && (nodes[idx].text !== text || checkboxMatch)) pushUndo();
    const next = nodes.map((n) => {
      if (n.id !== id) return n;
      if (checkboxMatch) {
        return { ...n, text: checkboxMatch[2], isCheckbox: true, checked: checkboxMatch[1].toLowerCase() === 'x' };
      }
      return { ...n, text };
    });
    set({ nodes: next, editingId: null });
  },

  cancelEdit: () => set({ editingId: null }),

  newSiblingBelow: (id) => {
    const { nodes, nextId } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    pushUndo();
    const next = nodes.map((n) => ({ ...n }));
    const newNode: OutlineNode = {
      id: nextId,
      depth: nodes[idx].depth,
      text: '',
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: []
    };
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
    pushUndo();
    const next = nodes.map((n) => ({ ...n }));
    const newNode: OutlineNode = {
      id: nextId,
      depth: nodes[idx].depth + 1,
      text: '',
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: []
    };
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
    pushUndo();
    const pos = Math.max(0, Math.min(caretPos, fullText.length));
    const before = fullText.slice(0, pos);
    const after = fullText.slice(pos);
    const next = nodes.map((n) => ({ ...n }));
    next[idx] = { ...next[idx], text: before };
    const newNode: OutlineNode = {
      id: nextId,
      depth: next[idx].depth,
      text: after,
      parentId: null,
      isCheckbox: false,
      checked: false,
      note: '',
      codeBlock: null,
      tags: []
    };
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
    pushUndo();
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
    pushUndo();
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
    pushUndo();
    const next = nodes.map((n) => ({ ...n }));
    const sorted = sortChildBlocksCore(next, parentIdx, mode);
    if (!sorted) {
      // Matches moveNode's own pushUndo()-then-pop-on-failure handling above, for the same
      // reason: the pre-emptive checkpoint above turns out not to correspond to a real change.
      set({ undoStack: get().undoStack.slice(0, -1) });
      return false;
    }
    rebuildParentIdsCore(next);
    set({ nodes: next });
    return true;
  },

  // Flips a node's checked state, cascading down to its checkbox descendants and propagating
  // completion status up to its checkbox ancestors via the real ported toggleCheckboxCore —
  // no rebuildParentIdsCore needed here, unlike almost every other mutation above, since
  // toggling .checked never changes a node's depth or position. Matches legacy's own
  // toggleCheckbox in not guarding on isCheckboxNode(node) first (see toggleCheckboxCore's own
  // header) -- the UI below only ever wires this to elements that already only render for
  // checkbox nodes.
  toggleCheckbox: (id) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    pushUndo();
    const next = nodes.map((n) => ({ ...n }));
    toggleCheckboxCore(next, idx);
    set({ nodes: next });
  },

  // Plain text field, no rich-HTML/sanitization (deferred) -- matches legacy's `node.note`
  // field but scoped down for this first Phase 3 slice.
  setNote: (id, note) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    // Same no-op-avoidance as commitEdit's own guard above -- called once on blur (not per
    // keystroke, see OutlineTree.tsx's own onBlur wiring), so a real check against the
    // currently-stored value is meaningful here, not just always-true noise.
    if (nodes[idx].note !== note) pushUndo();
    const next = nodes.map((n) => (n.id === id ? { ...n, note } : n));
    set({ nodes: next });
  },

  // A node's optional code block: {lang, code} or null. Same plain-field pattern as setNote
  // (no syntax highlighting yet, deferred).
  setCodeBlock: (id, codeBlock) => {
    const { nodes } = get();
    const idx = getIndex(nodes, id);
    if (idx < 0) return;
    const changed =
      (nodes[idx].codeBlock?.lang ?? null) !== (codeBlock?.lang ?? null) ||
      (nodes[idx].codeBlock?.code ?? null) !== (codeBlock?.code ?? null);
    if (changed) pushUndo();
    const next = nodes.map((n) => (n.id === id ? { ...n, codeBlock } : n));
    set({ nodes: next });
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
  },

  undo: () => {
    const { undoStack } = get();
    if (!undoStack.length) return;
    const s = get();
    const currentSnap: UndoSnapshot = {
      nodes: s.nodes,
      nextId: s.nextId,
      selectedId: s.selectedId,
      multiSelectedIds: s.multiSelectedIds,
      selectionAnchorId: s.selectionAnchorId,
      focusedId: s.focusedId
    };
    const popped = undoStack[undoStack.length - 1];
    set({ undoStack: undoStack.slice(0, -1), redoStack: [...get().redoStack, currentSnap] });
    applySnapshot(popped);
  },

  redo: () => {
    const { redoStack } = get();
    if (!redoStack.length) return;
    const s = get();
    const currentSnap: UndoSnapshot = {
      nodes: s.nodes,
      nextId: s.nextId,
      selectedId: s.selectedId,
      multiSelectedIds: s.multiSelectedIds,
      selectionAnchorId: s.selectionAnchorId,
      focusedId: s.focusedId
    };
    const popped = redoStack[redoStack.length - 1];
    set({ redoStack: redoStack.slice(0, -1), undoStack: [...get().undoStack, currentSnap] });
    applySnapshot(popped);
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0
  };
});

function withoutCollapse(collapsedIds: Set<number>, id: number): Set<number> {
  if (!collapsedIds.has(id)) return collapsedIds;
  const next = new Set(collapsedIds);
  next.delete(id);
  return next;
}

