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
 * real risk of a subtle bug in core editing logic (indent/outdent/move/paste all mutate a live
 * user's document), slices are picked in roughly ascending risk order — indent/outdent first
 * (pure depth-array mutation, no text-splitting/clipboard/drag-drop edge cases), then
 * moveSelected here (keyboard-driven single-block reordering — still no text-splitting or
 * clipboard, but real array-splice repositioning logic, one step up in complexity) — to prove
 * the decomposition pattern incrementally before attempting anything larger.
 *
 * Deliberately NOT extracted here, and why: `getSelectionRootIndexes`/`getSelectedIds`/
 * `rebuildParentIds` are used far more widely than any single mutation slice needs (13/18/23
 * real call sites respectively, across moveSelected/moveNodeBlock/insertSiblingBefore/
 * pasteParsedNodes/handleDrop/deleteSelected and more) — extracting them would mean updating
 * every one of those call sites in the same slice, a much larger blast radius than any single
 * slice here is scoped to. They remain hand-written, ambient-global functions, called by the
 * orchestration wrapper exactly as before; this module takes their output (`rootIndexes`, a
 * single `idx`) as plain parameters. Likewise `moveNodeBlock`/`moveMultipleNodeBlocks`/
 * `handleDrop` (drag-and-drop reordering — mode='above'/'below'/'child'/'end', depth remapping,
 * descendant-of-target checks, multi-block moves) are a substantially more complex superset of
 * what `moveSelected` does and are deliberately deferred to their own later, more carefully
 * scoped slice rather than folded into this one.
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

declare function getSubtreeEnd(nodes: QueryableNode[], idx: number): number;

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
