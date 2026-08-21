/**
 * Pure selection-computation and parent-id-rebuild logic for the outline — a third `core/`
 * slice alongside nodeQueries.ts (read-only queries) and nodeMutations.ts (tree mutations).
 *
 * These three functions (`getSelectionRootIndexes`/`getSelectedIds`/`rebuildParentIds`) were
 * deliberately left out of every nodeMutations.ts slice so far, flagged there as "used far more
 * widely than any single mutation slice needs" (79 real call sites total across the file). That
 * framing conflated two different things: how many places CALL a function, and how many places
 * need to CHANGE to extract it. Re-investigated here: all three functions can keep their exact
 * original names and signatures — the orchestration wrappers in index.html become thin
 * delegates to the extracted pure logic, exactly like nodeMutations.ts's own indent/outdent
 * wrappers delegate to `indentRootIndexes`/`outdentRootIndexes`. Zero of the 79 call sites need
 * to change. `clearMultiSelection` (the fourth function in that original list) stays
 * hand-written — a genuine one-line ambient assignment (`multiSelectedIds=[]`) with no logic to
 * extract, same reasoning as `getAllAiProviders`/`getAiProviderById` staying out of
 * aiProviders.ts.
 *
 * `getParentIndex` (from nodeQueries.ts, already a generated block spliced in elsewhere in
 * index.html) is referenced as an ambient global via `declare function` below — type-only,
 * fully erased from the compiled JS output, resolving at runtime to the real already-spliced
 * nodeQueries function since every generated block shares one script scope. This is NOT a real
 * import — see nodeMutations.ts's own header for why a real value import would silently kill
 * the whole script if it survived compilation.
 */

import type { QueryableNode } from './nodeQueries';
import { getParentIndex } from './nodeQueries';


/** The node shape `rebuildParentIds` needs beyond `QueryableNode`: a mutable `parentId` field. */
export interface ParentLinkedNode extends QueryableNode {
  parentId: number | null;
}

/** Pure: the currently-selected node ids, matching the original's three-way fallback exactly —
 * select-all mode returns every node's id; otherwise the multi-select set (filtered against
 * nodes that still exist, deduplicated) if non-empty; otherwise the single `selectedId` (or an
 * empty array if nothing is selected at all). */
export function computeSelectedIds(
  nodes: QueryableNode[],
  selectAllMode: boolean,
  multiSelectedIds: QueryableNode['id'][],
  selectedId: QueryableNode['id'] | null
): QueryableNode['id'][] {
  if (selectAllMode) return nodes.map((n) => n.id);
  const base = multiSelectedIds.filter((id) => nodes.some((n) => n.id === id));
  if (base.length) return [...new Set(base)];
  return selectedId !== null ? [selectedId] : [];
}

/** Pure: the indexes of the "root" selected nodes — selected nodes whose nearest shallower
 * ancestor is NOT itself selected, i.e. the top of each selected subtree, so a caller acting on
 * "the selection" doesn't double-process a child whose parent is also selected. Matches the
 * original's exact walk-backward-to-find-an-ancestor logic. */
export function computeSelectionRootIndexes(nodes: QueryableNode[], selectedIds: QueryableNode['id'][]): number[] {
  const allIds = new Set(selectedIds);
  const indexes = nodes
    .map((n, i) => (allIds.has(n.id) ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  return indexes.filter((idx) => {
    const depth = nodes[idx].depth;
    for (let i = idx - 1; i >= 0; i--) {
      if (nodes[i].depth < depth) return !allIds.has(nodes[i].id);
    }
    return true;
  });
}

/** Mutates `nodes` in place, recomputing every node's `parentId` from its position/depth via
 * `getParentIndex` — the same in-place-mutation convention as nodeMutations.ts's `nodes.splice`
 * pattern, preserved deliberately since callers rely on it updating the array they already hold
 * a reference to, not on a return value (the original returned nothing either). Called after
 * any operation that changes node order or depth (indent/outdent/move/paste/delete/etc.), since
 * parentId is derived state that would otherwise go stale. */
export function rebuildParentIdsCore(nodes: ParentLinkedNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const p = getParentIndex(nodes, i);
    nodes[i].parentId = p >= 0 ? nodes[p].id : null;
  }
}
