import {
  getIndex,
  getSubtreeEnd,
  getParentIndex,
  getChildBlocks,
  subtreeHeight,
  isCheckboxNode,
  getCheckboxChildStats,
  type CheckboxNode
} from './nodeQueries';

/**
 * Pure tree-mutation logic for the outline — the `core/` module boundary for the tree-mutation
 * engine, complementing nodeQueries.ts's read-only tree queries with the write side.
 *
 * Why this is a genuinely different kind of extraction than anything in Phase 1/2/3 so far:
 * every other mutation function in index.html (insertSiblingBefore, moveNodeBlock,
 * pasteParsedNodes, handleDrop, etc.) fuses pure state mutation with orchestration — undo-stack
 * pushes, dirty-flag marking, selection updates, render() calls, sometimes edit-mode triggers —
 * all interleaved in the same lines, with no seam between them. There is no way to "just
 * relocate" that code the way nodeQueries.ts's zero-side-effect queries were relocated; it has
 * to be DECOMPOSED into a pure state-transition plus the orchestration that calls it. Given the
 * real risk of a subtle bug in core editing logic (indent/outdent/move/paste/delete all mutate
 * a live user's document), slices are picked in roughly ascending risk order — indent/outdent
 * first (pure depth-array mutation, no text-splitting/clipboard/drag-drop edge cases), then
 * moveSelected (keyboard-driven single-block reordering), then drag-and-drop move (multiple
 * modes, depth remapping, a descendant guard, a multi-block reordering algorithm), then paste
 * (computing the depth offset a pasted block needs, inserting already-built node objects), then
 * delete here (removing selected subtrees) — to prove the decomposition pattern incrementally.
 * `splitNodeAtCursor` — originally assumed to be the next candidate after paste — turned out to
 * be genuinely dead code (confirmed via exhaustive grep: zero call sites anywhere, not even
 * indirect ones; the real Enter-key handler calls `insertSiblingAfter`/`insertChildFirst`
 * instead, never a text-split), so it was skipped in favor of `deleteSelected`, which has real,
 * active usage (confirmed via call-site count before starting, same discipline as every slice).
 *
 * Deliberately NOT extracted here (moved instead to `src/core/nodeSelection.ts`, a later
 * slice): `getSelectionRootIndexes`/`getSelectedIds`/`rebuildParentIds` were originally assumed
 * to need updating every one of their ~79 call sites to extract — re-investigated in
 * nodeSelection.ts and found untrue; they kept their exact original names/signatures instead,
 * same as this file's own indent/outdent wrappers. `clearMultiSelection` stays hand-written (a
 * genuine one-liner, no logic to extract). This module's functions take or return only what
 * they specifically need (`rootIndexes`, a single
 * `idx`, dragged/target ids, mode, an insertion index and already-built node objects) as plain
 * parameters/return values — selection-state side effects (`selectedId`, `selectionAnchorId`,
 * `multiSelectedIds`, `selectAllMode`, `clearMultiSelection()`) stay in the hand-written
 * wrappers, assigned based on what the core function reports happened. `makeNode()` (which
 * mints a fresh id from a global `nextId` counter, among other real side effects) likewise
 * stays hand-written and ambient — the paste slice's core functions take already-built node
 * objects as input rather than building them, the same "pure functions receive fully-formed
 * data, orchestration wrappers do the side-effecting construction" split used throughout.
 *
 * `getSubtreeEnd` (from nodeQueries.ts, already a generated block spliced in elsewhere in
 * index.html) is referenced as an ambient global via `declare function` below — type-only,
 * fully erased from the compiled JS output (verified: compiling a minimal repro confirms zero
 * runtime emission for a bare `declare function`), resolving at runtime to the real
 * already-spliced nodeQueries function since every generated block shares one script scope.
 * This is NOT a real import — see the serializeMarkdown cutover's own lesson on why a real
 * value import would silently kill the whole script if it survived compilation. `QueryableNode`
 * (the node-shape type) IS a real `import type` — genuinely erased, same as nodeQueries.ts's
 * own reference to serializeMarkdown.ts's types — reusing it here rather than redefining an
 * equivalent interface keeps one source of truth for what a "queryable node" shape is.
 */

import type { QueryableNode } from './nodeQueries';


/** Pure: can the node at `idx` be indented — i.e. does it have an earlier sibling at the same
 * depth to become a child of? Walks backward from `idx`; an earlier node at a shallower depth
 * means we've walked past the start of this node's sibling run without finding one. */
export function canIndentAt(nodes: QueryableNode[], idx: number): boolean {
  const depth = nodes[idx].depth;
  for (let i = idx - 1; i >= 0; i--) {
    if (nodes[i].depth === depth) return true;
    if (nodes[i].depth < depth) return false;
  }
  return false;
}

/** Mutates `nodes` in place, incrementing `.depth` by 1 for every node in each root index's
 * subtree (root inclusive). Matches the original's in-place mutation style exactly — this is
 * "pure" in the sense of having no side effects beyond the nodes array itself (no undo stack,
 * no dirty flag, no render, no DOM), not in the sense of avoiding mutation altogether; other
 * mutation functions throughout index.html follow the same in-place-mutation convention, and
 * changing that here would be an unrelated behavior change outside this extraction's scope.
 * Does NOT call rebuildParentIds() or check canIndentAt() itself — both remain the caller's
 * responsibility, exactly as in the original (the guard check happens before this is called;
 * rebuildParentIds happens after, since parentId depends on the NEW depths this function sets). */
export function indentRootIndexes(nodes: QueryableNode[], rootIndexes: number[]): void {
  for (const idx of rootIndexes) {
    const end = getSubtreeEnd(nodes, idx);
    for (let i = idx; i < end; i++) nodes[i].depth += 1;
  }
}

/** Mutates `nodes` in place, decrementing `.depth` by 1 for every node in each root index's
 * subtree — EXCEPT root indexes already at depth 0, which are individually skipped (preserved
 * from the original: a mixed-depth selection partially outdents, rather than being an
 * all-or-nothing operation the way the outer guard for whether to run at all is). See
 * indentRootIndexes's own comment for why this mutates in place and doesn't call
 * rebuildParentIds() itself. */
export function outdentRootIndexes(nodes: QueryableNode[], rootIndexes: number[]): void {
  for (const idx of rootIndexes) {
    if (nodes[idx].depth === 0) continue;
    const end = getSubtreeEnd(nodes, idx);
    for (let i = idx; i < end; i++) nodes[i].depth -= 1;
  }
}

/** Pure: can the node at `idx` move up past its preceding sibling? False for the very first
 * node (`idx===0`) since there's nothing before it — walking backward with `i=idx-1` never
 * enters the loop, so this already returns false without a separate explicit check, matching
 * the original's behavior even though the original ALSO has a redundant `idx===0` guard at its
 * call site (preserved as-is in the orchestration wrapper, not simplified away here). */
export function canMoveUpAt(nodes: QueryableNode[], idx: number): boolean {
  const depth = nodes[idx].depth;
  let i = idx - 1;
  while (i >= 0 && nodes[i].depth > depth) i--;
  return i >= 0 && nodes[i].depth === depth;
}

/** Pure: can the subtree occupying `[idx, end)` move down past its following sibling? `end` is
 * the caller-supplied subtree-end index (from `getSubtreeEnd(nodes, idx)`) — passed in rather
 * than recomputed here since the orchestration wrapper already needs it for its own guard. */
export function canMoveDownAt(nodes: QueryableNode[], idx: number, end: number): boolean {
  const depth = nodes[idx].depth;
  return end < nodes.length && nodes[end].depth === depth;
}

/** Moves the subtree rooted at `idx` up, past its immediately preceding sibling (and that
 * sibling's own subtree, so the move lands before the START of the preceding sibling's block,
 * not just before the sibling node itself). Mutates `nodes` in place; returns the moved
 * subtree's root node's `id`, matching the original's `selectedId=block[0].id` reassignment,
 * which stays the caller's responsibility (see indentRootIndexes's comment for why this module
 * mutates in place rather than returning a new array). Does not check `canMoveUpAt()` itself —
 * that guard, along with pushUndo/rebuildParentIds/markDirty/render, stays in the orchestration
 * wrapper exactly as in the original. */
export function moveNodeUp(nodes: QueryableNode[], idx: number): QueryableNode['id'] {
  const end = getSubtreeEnd(nodes, idx);
  const block = nodes.slice(idx, end);
  const myDepth = nodes[idx].depth;
  let targetStart = idx - 1;
  while (targetStart > 0 && nodes[targetStart].depth > myDepth) targetStart--;
  nodes.splice(idx, end - idx);
  nodes.splice(targetStart, 0, ...block);
  return block[0].id;
}

/** Moves the subtree rooted at `idx` down, past its immediately following sibling's entire
 * subtree. Mutates `nodes` in place; returns the moved subtree's root node's `id`. See
 * moveNodeUp's comment for what stays the caller's responsibility. */
export function moveNodeDown(nodes: QueryableNode[], idx: number): QueryableNode['id'] {
  const end = getSubtreeEnd(nodes, idx);
  const block = nodes.slice(idx, end);
  const nextEnd = getSubtreeEnd(nodes, end);
  nodes.splice(idx, end - idx);
  const insertAt = nextEnd - (end - idx);
  nodes.splice(insertAt, 0, ...block);
  return block[0].id;
}

export type DropMode = 'above' | 'below' | 'child' | 'end';

/** Pure: is `maybeDescendantIdx` inside `ancestorIdx`'s subtree? Used to reject a drag-and-drop
 * that would move a node into its own descendant (which would orphan the moved subtree). */
export function isDescendantIndex(nodes: QueryableNode[], maybeDescendantIdx: number, ancestorIdx: number): boolean {
  return maybeDescendantIdx > ancestorIdx && maybeDescendantIdx < getSubtreeEnd(nodes, ancestorIdx);
}

/** Moves the single subtree rooted at `draggedId` to a new position relative to `targetId`,
 * per `mode`: 'above'/'below' place it as `targetId`'s preceding/following sibling (same
 * depth as `targetId`); 'child' places it as `targetId`'s first child (depth + 1); 'end'
 * ignores `targetId` and moves it to the very end of the document at depth 0. The moved
 * subtree's OWN descendants move with it, depth-shifted by the same delta as the root
 * (floored at 0 via `Math.max(0, ...)` — preserved exactly from the original, which guards
 * against a negative depth in edge cases rather than assuming the delta math can never
 * produce one). Rejects the move (returns `false`, `nodes` unchanged) if: `draggedId===
 * targetId`; either id isn't found; or `targetId` is inside `draggedId`'s own subtree (via
 * `isDescendantIndex` — moving a node into its own descendant would orphan it). Mutates
 * `nodes` in place; does NOT call `rebuildParentIds()` or touch any selection state
 * (`selectedId`/`selectionAnchorId`/`multiSelectedIds`/`selectAllMode`) — all of that stays
 * the orchestration wrapper's responsibility, assigned only when this returns `true`. */
export function moveNodeBlockCore(
  nodes: QueryableNode[],
  draggedId: QueryableNode['id'],
  targetId: QueryableNode['id'],
  mode: DropMode = 'below'
): boolean {
  if (mode === 'end') {
    const fromIdx = getIndex(nodes, draggedId);
    if (fromIdx < 0) return false;
    const fromEnd = getSubtreeEnd(nodes, fromIdx);
    const sourceDepth = nodes[fromIdx].depth;
    const block = nodes.slice(fromIdx, fromEnd).map((n) => ({ ...n }));
    if (sourceDepth !== 0) {
      block.forEach((n) => {
        n.depth = Math.max(0, n.depth - sourceDepth);
      });
    }
    nodes.splice(fromIdx, fromEnd - fromIdx);
    nodes.push(...block);
    return true;
  }
  if (draggedId === targetId) return false;
  const fromIdx = getIndex(nodes, draggedId);
  const targetIdxOriginal = getIndex(nodes, targetId);
  if (fromIdx < 0 || targetIdxOriginal < 0) return false;
  if (isDescendantIndex(nodes, targetIdxOriginal, fromIdx)) return false;
  const fromEnd = getSubtreeEnd(nodes, fromIdx);
  const sourceDepth = nodes[fromIdx].depth;
  let insertAtOriginal = targetIdxOriginal;
  let newDepth = sourceDepth;
  if (mode === 'above') {
    insertAtOriginal = targetIdxOriginal;
    newDepth = nodes[targetIdxOriginal].depth;
  } else if (mode === 'below') {
    insertAtOriginal = getSubtreeEnd(nodes, targetIdxOriginal);
    newDepth = nodes[targetIdxOriginal].depth;
  } else {
    insertAtOriginal = targetIdxOriginal + 1;
    newDepth = nodes[targetIdxOriginal].depth + 1;
  }
  const block = nodes.slice(fromIdx, fromEnd).map((n) => ({ ...n }));
  const depthDelta = newDepth - sourceDepth;
  if (depthDelta !== 0) {
    block.forEach((n) => {
      n.depth = Math.max(0, n.depth + depthDelta);
    });
  }
  nodes.splice(fromIdx, fromEnd - fromIdx);
  const insertAt = insertAtOriginal > fromIdx ? insertAtOriginal - (fromEnd - fromIdx) : insertAtOriginal;
  nodes.splice(insertAt, 0, ...block);
  return true;
}

interface DraggedBlock {
  id: QueryableNode['id'];
  fromIdx: number;
  endIdx: number;
  sourceDepth: number;
}

/** Moves 2+ subtrees (identified by `draggedIds`, in whatever order the caller selected them)
 * to a new position relative to `targetId`, as one contiguous combined block, preserving each
 * dragged subtree's own internal structure and RELATIVE document order (re-sorted by original
 * position before processing, regardless of selection order) but not necessarily their
 * original adjacency to each other. Same `mode` semantics as `moveNodeBlockCore`. Rejects the
 * move (returns `null`, `nodes` unchanged) if: fewer than 2 valid dragged ids remain after
 * filtering out any not found; `mode!=='end'` and `targetId` is itself one of the dragged ids;
 * `targetId` isn't found; or `targetId` is inside ANY dragged block's own subtree. On success,
 * returns the subset of `draggedIds` that still exist post-move (matching the original's
 * `multiSelectedIds` recomputation) — always all of them in practice, since ids are stable
 * across the internal splice operations, but recomputed rather than assumed, exactly as the
 * original did. Mutates `nodes` in place; does NOT call `rebuildParentIds()` or touch any
 * selection state itself — see moveNodeBlockCore's own comment for why. */
export function moveMultipleNodeBlocksCore(
  nodes: QueryableNode[],
  draggedIds: QueryableNode['id'][],
  targetId: QueryableNode['id'],
  mode: DropMode = 'below'
): QueryableNode['id'][] | null {
  if (!draggedIds || draggedIds.length < 2) return null;
  const draggedSet = new Set(draggedIds);
  if (mode !== 'end' && draggedSet.has(targetId)) return null;
  // Extract every dragged block's current position/subtree BEFORE any removal, in document order.
  const blocks: DraggedBlock[] = draggedIds
    .map((id): DraggedBlock | null => {
      const idx = getIndex(nodes, id);
      return idx < 0 ? null : { id, fromIdx: idx, endIdx: getSubtreeEnd(nodes, idx), sourceDepth: nodes[idx].depth };
    })
    .filter((b): b is DraggedBlock => b !== null)
    .sort((a, b) => a.fromIdx - b.fromIdx);
  if (blocks.length < 2) return null;
  if (mode !== 'end') {
    const targetIdxOriginal = getIndex(nodes, targetId);
    if (targetIdxOriginal < 0) return null;
    // Target can't be a descendant of any dragged block either — same guard moveNodeBlockCore
    // applies for the single-node case, checked here against every block.
    if (blocks.some((b) => isDescendantIndex(nodes, targetIdxOriginal, b.fromIdx))) return null;
  }
  const copies = blocks.map((b) => ({ ...b, copy: nodes.slice(b.fromIdx, b.endIdx).map((n) => ({ ...n })) }));
  // Remove last-to-first so earlier blocks' indexes stay valid while later ones are spliced out.
  for (let i = copies.length - 1; i >= 0; i--) nodes.splice(copies[i].fromIdx, copies[i].endIdx - copies[i].fromIdx);
  let insertAt: number;
  let newDepth: number;
  if (mode === 'end') {
    insertAt = nodes.length;
    newDepth = 0;
  } else {
    const tIdxNow = getIndex(nodes, targetId); // ids are stable across splice, so re-resolve post-removal
    if (mode === 'above') {
      insertAt = tIdxNow;
      newDepth = nodes[tIdxNow].depth;
    } else if (mode === 'below') {
      insertAt = getSubtreeEnd(nodes, tIdxNow);
      newDepth = nodes[tIdxNow].depth;
    } else {
      insertAt = tIdxNow + 1;
      newDepth = nodes[tIdxNow].depth + 1;
    }
  }
  const combined: QueryableNode[] = [];
  copies.forEach((b) => {
    const depthDelta = newDepth - b.sourceDepth;
    b.copy.forEach((n) => {
      combined.push({ ...n, depth: Math.max(0, n.depth + depthDelta) });
    });
  });
  nodes.splice(insertAt, 0, ...combined);
  return draggedIds.filter((id) => getIndex(nodes, id) >= 0);
}

/** Pure: the depth every node in a pasted block should be offset by, so the pasted content
 * lands as siblings of the node currently being edited rather than keeping whatever depth it
 * had in its original context (which — without this offset — would insert depth-0 nodes into
 * the middle of the array, and everything originally following the insertion point would then
 * read as descendants of those newly-inserted depth-0 nodes, since depth-based subtree/parent
 * logic has no other way to tell "sibling" from "ancestor" apart: a serious structural
 * corruption, not just a cosmetic indent issue). Returns 0 (no offset — paste at depth as-is)
 * when there's no valid insertion context: an empty document, or `insertIdx` not found
 * (`insertIdx` is `getIndex(nodes, selectedId)`, computed by the caller; the original also had
 * an explicit `selectedId===null` check here, which is mathematically redundant — no node's id
 * is ever `null`, so `getIndex(nodes, null)` already returns -1 — preserved in spirit by this
 * function depending only on `insertIdx`, not on `selectedId` itself). */
export function computePasteOffsetDepth(nodes: QueryableNode[], insertIdx: number): number {
  const noContext = !nodes.length || insertIdx < 0;
  return noContext ? 0 : nodes[insertIdx].depth;
}

/** Inserts a block of already-built, already-depth-offset node objects into `nodes`, either
 * replacing the whole (empty or context-less) document, or splicing in right after the
 * insertion point's own subtree ends — the same two cases `computePasteOffsetDepth` handles,
 * using the identical `noContext` condition so the two functions' behavior always agrees.
 * Mutates `nodes` in place; the empty-document case uses `nodes.splice(0, nodes.length, ...
 * mappedNodes)` rather than the original's `nodes=mapped` reassignment — a plain array
 * parameter can't reassign the caller's own variable binding the way a global assignment can,
 * so this achieves the identical end state (same final contents) through the same in-place-
 * mutation convention every other function in this module uses, rather than the original's
 * literal statement. Does not call `rebuildParentIds()`, build the node objects themselves
 * (that's `makeNode()`'s job — real side effects, stays hand-written), or touch any selection
 * state — all of that stays the orchestration wrapper's responsibility. */
export function insertParsedNodesCore(nodes: QueryableNode[], insertIdx: number, mappedNodes: QueryableNode[]): void {
  const noContext = !nodes.length || insertIdx < 0;
  if (noContext) {
    nodes.splice(0, nodes.length, ...mappedNodes);
  } else {
    nodes.splice(getSubtreeEnd(nodes, insertIdx), 0, ...mappedNodes);
  }
}

/** Removes each root index's entire subtree from `nodes`, mutating in place. Processes
 * `rootIndexes` in REVERSE order — deleting from the end of the document backward — so that
 * removing a later block never shifts the array positions of an earlier block still waiting to
 * be removed (the same "process in an order that keeps not-yet-processed indexes valid"
 * principle `moveMultipleNodeBlocksCore` uses for its own removal step, just simpler here since
 * nothing needs to be re-inserted afterward). Does not compute `rootIndexes` itself (that's
 * `getSelectionRootIndexes()`, ambient and hand-written, called by the caller before this), nor
 * handle the separate "select-all: clear the entire document" case `deleteSelected` has its own
 * branch for (a fundamentally different, much simpler reset that doesn't go through subtree
 * removal at all — not this function's concern). Also does not call `rebuildParentIds()`,
 * collect deleted node text/ids for the backlinks/auto-rewrite-queue/featured-tables cleanup
 * `deleteSelected` does around this call (those are genuinely separate feature domains, not
 * part of the core outline engine, and need to run on the PRE-deletion node data anyway — the
 * caller collects that before calling this), or touch any selection state — all of that stays
 * the orchestration wrapper's responsibility, same convention as every function in this module. */
export function deleteRootIndexes(nodes: QueryableNode[], rootIndexes: number[]): void {
  for (let r = rootIndexes.length - 1; r >= 0; r--) {
    const idx = rootIndexes[r];
    const end = getSubtreeEnd(nodes, idx);
    nodes.splice(idx, end - idx);
  }
}

/** How child blocks under a parent get reordered: alphabetical by the child's own root text
 * (HTML-stripped, case-insensitive), reverse-alphabetical, or shallowest-subtree-first (stable
 * on ties, by original position). */
export type SortMode = 'az' | 'za' | 'depth';

/**
 * Mutates `nodes` in place, reordering the immediate child blocks under `parentIdx` (or every
 * top-level root block, if `parentIdx` is `null`) according to `mode` — each child's whole
 * subtree moves together via `getChildBlocks`, never just the child node itself. Returns `false`
 * (no-op, `nodes` unchanged) if there are fewer than 2 blocks to sort; `true` otherwise. Does
 * NOT call `rebuildParentIds()` itself — same convention as every other mutation in this module.
 *
 * NOT a Phase 1 port, same status as `getChildBlocks`/`subtreeHeight` in nodeQueries.ts (see
 * that file's own header): index.html's real `sortChildBlocks` was never one of the extracted
 * `src/core/` generated blocks, so this is freshly written to match it exactly rather than
 * copied from an existing module.
 */
export function sortChildBlocksCore(nodes: QueryableNode[], parentIdx: number | null, mode: SortMode): boolean {
  const blocks = getChildBlocks(nodes, parentIdx);
  if (blocks.length < 2) return false;
  const decorated = blocks.map((b) => ({
    ...b,
    text: String(nodes[b.start].text || '')
      .replace(/<[^>]*>/g, '')
      .toLowerCase(),
    height: subtreeHeight(nodes, b.start, b.end)
  }));
  let sorted: typeof decorated;
  if (mode === 'az') sorted = decorated.slice().sort((a, b) => a.text.localeCompare(b.text));
  else if (mode === 'za') sorted = decorated.slice().sort((a, b) => b.text.localeCompare(a.text));
  // 'depth': shallowest subtree first, stable for ties (falls back to original position).
  else sorted = decorated.slice().sort((a, b) => a.height - b.height || a.start - b.start);
  const rangeStart = blocks[0].start;
  const rangeEnd = blocks[blocks.length - 1].end;
  const reordered = sorted.flatMap((b) => nodes.slice(b.start, b.end));
  nodes.splice(rangeStart, rangeEnd - rangeStart, ...reordered);
  return true;
}

/** Mutates `nodes` in place: sets `.checked` on every checkbox descendant of `idx`'s subtree to
 * `checked` — a checked/unchecked parent checkbox cascades the same state down to every
 * checkbox node beneath it (non-checkbox descendants are left untouched, matching legacy's own
 * `isCheckboxNode` filter). Same never-extracted-in-legacy status as `getChildBlocks`/
 * `sortChildBlocksCore` above — index.html's real `cascadeCheckboxDown` was never one of the
 * `src/core/` generated blocks either. */
export function cascadeCheckboxDown(nodes: CheckboxNode[], idx: number, checked: boolean): void {
  const end = getSubtreeEnd(nodes, idx);
  for (let i = idx + 1; i < end; i++) {
    if (isCheckboxNode(nodes[i])) nodes[i].checked = checked;
  }
}

/** Mutates `nodes` in place: walks upward from `idx`, auto-completing (or un-completing) each
 * checkbox ANCESTOR whose direct checkbox children are all checked (or no longer all checked),
 * recursing further up only when an ancestor's own checked state actually changes — matching
 * legacy's own `propagateCheckboxUp` exactly, including the "only walk further if something
 * changed" short-circuit that keeps this from doing needless work on every toggle. A non-
 * checkbox parent, or a checkbox parent with zero checkbox children, stops the walk at that
 * level (total===0 is treated as "nothing to auto-complete from", not "vacuously all done"). */
export function propagateCheckboxUp(nodes: CheckboxNode[], idx: number): void {
  const pIdx = getParentIndex(nodes, idx);
  if (pIdx < 0) return;
  const parent = nodes[pIdx];
  if (!isCheckboxNode(parent)) return;
  const { total, checked } = getCheckboxChildStats(nodes, pIdx);
  if (total > 0) {
    const allDone = checked === total;
    if (parent.checked !== allDone) {
      parent.checked = allDone;
      propagateCheckboxUp(nodes, pIdx);
    }
  }
}

/** Mutates `nodes` in place: flips `idx`'s own `.checked`, then cascades that new state down to
 * every checkbox descendant and propagates completion status up to every checkbox ancestor —
 * the single entry point orchestrating both directions, matching legacy's own `toggleCheckbox`
 * (minus the undo/dirty/render side effects, which stay the caller's responsibility, same
 * convention as every other mutation in this module). Does NOT check `isCheckboxNode(nodes[idx])`
 * first — same as legacy, which only ever calls this from a UI element that already only exists
 * on checkbox nodes; toggling `.checked` on a non-checkbox node is harmless (nothing reads it)
 * but not this function's job to prevent. */
export function toggleCheckboxCore(nodes: CheckboxNode[], idx: number): void {
  const newChecked = !nodes[idx].checked;
  nodes[idx].checked = newChecked;
  cascadeCheckboxDown(nodes, idx, newChecked);
  propagateCheckboxUp(nodes, idx);
}
