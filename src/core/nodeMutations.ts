/**
 * Pure indent/outdent depth mutation for the outline tree — the first slice of a real `core/`
 * module boundary for the tree-mutation engine, complementing nodeQueries.ts's read-only tree
 * queries with the write side.
 *
 * Why this is a genuinely different kind of extraction than anything in Phase 1/2/3 so far:
 * every other mutation function in index.html (insertSiblingBefore, moveNodeBlock,
 * pasteParsedNodes, handleDrop, etc.) fuses pure state mutation with orchestration — undo-stack
 * pushes, dirty-flag marking, selection updates, render() calls, sometimes edit-mode triggers —
 * all interleaved in the same lines, with no seam between them. There is no way to "just
 * relocate" that code the way nodeQueries.ts's zero-side-effect queries were relocated; it has
 * to be DECOMPOSED into a pure state-transition plus the orchestration that calls it. Given the
 * real risk of a subtle bug in core editing logic (indent/outdent/move/paste all mutate a live
 * user's document), this is deliberately started with the single simplest, lowest-risk
 * candidate — pure depth-array mutation, no text-splitting, no clipboard, no drag-and-drop edge
 * cases — to prove the decomposition pattern before attempting anything larger.
 *
 * Deliberately NOT extracted here, and why: `getSelectionRootIndexes`/`getSelectedIds`/
 * `rebuildParentIds` are used far more widely than just indent/outdent (13/18/23 real call
 * sites respectively, across moveSelected/moveNodeBlock/insertSiblingBefore/pasteParsedNodes/
 * handleDrop/deleteSelected and more) — extracting them would mean updating every one of those
 * call sites in this same slice, which is a much larger blast radius than "the simplest
 * possible first case" this slice is deliberately scoped to. They remain hand-written,
 * ambient-global functions, called by the orchestration wrapper exactly as before; this module
 * takes their output (`rootIndexes`) as a plain parameter.
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
