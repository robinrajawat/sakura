import { describe, it, expect, beforeAll } from 'vitest';
import { computeSelectedIds, computeSelectionRootIndexes, rebuildParentIdsCore, type ParentLinkedNode } from '../../src/core/nodeSelection';
import { getParentIndex } from '../../src/core/nodeQueries';

// nodeSelection.ts references getParentIndex as an ambient global (a `declare function`, erased
// at compile time — see the module's own header comment for why). In the real app that global is
// provided by nodeQueries.ts's own generated block sharing the same script scope; in this Node
// test environment there is no such shared scope, so it's wired up explicitly here from the real
// implementation — not a mock, the actual tested function.
beforeAll(() => {
  const g = globalThis as unknown as { getParentIndex: typeof getParentIndex };
  g.getParentIndex = getParentIndex;
});

interface TestNode {
  id: number;
  depth: number;
}

function tree(depths: number[]): TestNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth }));
}

function linkedTree(depths: number[]): ParentLinkedNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth, parentId: null }));
}

// Pinned local oracle — literal copy of index.html's current getSelectedIds, modified only to
// accept its ambient reads as explicit parameters, same approach as nodeQueries.test.ts.
function oGetSelectedIds(
  nodes: TestNode[],
  selectAllMode: boolean,
  multiSelectedIds: number[],
  selectedId: number | null
): number[] {
  if (selectAllMode) return nodes.map((n) => n.id);
  const base = multiSelectedIds.filter((id) => nodes.some((n) => n.id === id));
  if (base.length) return [...new Set(base)];
  return selectedId !== null ? [selectedId] : [];
}

// Pinned local oracle — literal copy of index.html's current getSelectionRootIndexes.
function oGetSelectionRootIndexes(nodes: TestNode[], selectedIds: number[]): number[] {
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

describe('computeSelectedIds', () => {
  it('select-all mode returns every node id, ignoring multiSelectedIds/selectedId', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectedIds(t, true, [], null)).toEqual([1, 2, 3]);
    expect(computeSelectedIds(t, true, [99], 1)).toEqual([1, 2, 3]);
  });

  it('returns the deduplicated multi-select set (filtered to existing nodes) when non-empty', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectedIds(t, false, [1, 2, 1, 999], 3)).toEqual([1, 2]);
  });

  it('falls back to the single selectedId when multiSelectedIds is empty', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectedIds(t, false, [], 2)).toEqual([2]);
  });

  it('falls back to an empty array when nothing is selected at all', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectedIds(t, false, [], null)).toEqual([]);
  });

  it('falls back to selectedId when multiSelectedIds only references deleted nodes', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectedIds(t, false, [999], 2)).toEqual([2]);
  });

  it.each([
    [tree([0, 1, 1, 0, 1]), false, [2, 3], null],
    [tree([0, 1, 1, 0, 1]), false, [], 4],
    [tree([0, 1, 1, 0, 1]), true, [1], null],
    [tree([]), false, [], null]
  ])('matches the oracle across representative cases', (t, selectAllMode, multi, selectedId) => {
    expect(computeSelectedIds(t as TestNode[], selectAllMode as boolean, multi as number[], selectedId as number | null)).toEqual(
      oGetSelectedIds(t as TestNode[], selectAllMode as boolean, multi as number[], selectedId as number | null)
    );
  });
});

describe('computeSelectionRootIndexes', () => {
  it('returns a single selected leaf node', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectionRootIndexes(t, [2])).toEqual([1]);
  });

  it('excludes a selected child whose parent is also selected (only the root shows)', () => {
    // A(0) B(1, child of A) — both selected, only A's index should be returned
    const t = tree([0, 1]);
    expect(computeSelectionRootIndexes(t, [1, 2])).toEqual([0]);
  });

  it('includes a selected child whose parent is NOT selected', () => {
    const t = tree([0, 1]);
    expect(computeSelectionRootIndexes(t, [2])).toEqual([1]);
  });

  it('handles two disjoint selected subtrees, each contributing its own root', () => {
    // A(0) A1(1) B(0) B1(1) — select A1 and B1: neither's parent (A/B) is selected, so both are roots
    const t = tree([0, 1, 0, 1]);
    expect(computeSelectionRootIndexes(t, [2, 4])).toEqual([1, 3]);
  });

  it('handles a selected grandchild whose parent is unselected but grandparent is selected', () => {
    // A(0) B(1) C(2) — select A and C: B (unselected) breaks the ancestor chain, so C is also a root
    const t = tree([0, 1, 2]);
    expect(computeSelectionRootIndexes(t, [1, 3])).toEqual([0, 2]);
  });

  it('returns [] for an empty selection', () => {
    const t = tree([0, 1, 0]);
    expect(computeSelectionRootIndexes(t, [])).toEqual([]);
  });

  it.each([
    [tree([0, 1, 1, 0, 1, 2]), [1, 2, 5, 6]],
    [tree([0, 1, 1, 0, 1, 2]), [3, 4]],
    [tree([0, 1, 1, 0, 1, 2]), [1, 2, 3, 4, 5, 6]]
  ])('matches the oracle across representative cases', (t, selectedIds) => {
    expect(computeSelectionRootIndexes(t as TestNode[], selectedIds as number[])).toEqual(
      oGetSelectionRootIndexes(t as TestNode[], selectedIds as number[])
    );
  });
});

describe('rebuildParentIdsCore', () => {
  it('sets parentId to null for every root-depth (depth 0) node', () => {
    const nodes = linkedTree([0, 0, 0]);
    rebuildParentIdsCore(nodes);
    expect(nodes.map((n) => n.parentId)).toEqual([null, null, null]);
  });

  it('links a single child to its immediately preceding shallower node', () => {
    const nodes = linkedTree([0, 1]);
    rebuildParentIdsCore(nodes);
    expect(nodes[1].parentId).toBe(nodes[0].id);
  });

  it('links deeply nested nodes to their nearest shallower ancestor, not just the immediate predecessor', () => {
    // A(0) B(1) C(2) D(1) — D's parent should be A (nearest depth-0 ancestor via getParentIndex's
    // own walk), not C, since D is back at depth 1.
    const nodes = linkedTree([0, 1, 2, 1]);
    rebuildParentIdsCore(nodes);
    expect(nodes[1].parentId).toBe(nodes[0].id); // B -> A
    expect(nodes[2].parentId).toBe(nodes[1].id); // C -> B
    expect(nodes[3].parentId).toBe(nodes[0].id); // D -> A
  });

  it('mutates the array in place — same object references, no new array returned', () => {
    const nodes = linkedTree([0, 1]);
    const originalRef = nodes;
    const result = rebuildParentIdsCore(nodes);
    expect(result).toBeUndefined();
    expect(nodes).toBe(originalRef);
    expect(nodes[0]).toBe(originalRef[0]);
  });

  it('recomputes correctly after nodes are reordered externally (the real indent/outdent/move use case)', () => {
    const nodes = linkedTree([0, 1, 0]);
    rebuildParentIdsCore(nodes);
    expect(nodes[1].parentId).toBe(nodes[0].id);
    // Simulate an indent: node[2] (depth 0) becomes depth 1, now a child of node[1]
    nodes[2].depth = 1;
    rebuildParentIdsCore(nodes);
    expect(nodes[2].parentId).toBe(nodes[0].id);
  });

  it('handles an empty array without throwing', () => {
    expect(() => rebuildParentIdsCore([])).not.toThrow();
  });
});
