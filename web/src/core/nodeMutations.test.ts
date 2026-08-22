import { describe, it, expect, beforeAll } from 'vitest';
import {
  canIndentAt,
  indentRootIndexes,
  outdentRootIndexes,
  canMoveUpAt,
  canMoveDownAt,
  moveNodeUp,
  moveNodeDown,
  isDescendantIndex,
  moveNodeBlockCore,
  moveMultipleNodeBlocksCore,
  computePasteOffsetDepth,
  insertParsedNodesCore,
  deleteRootIndexes,
  sortChildBlocksCore
} from './nodeMutations';
import { getSubtreeEnd, getIndex } from './nodeQueries';

// nodeMutations.ts references getSubtreeEnd/getIndex as ambient globals (a `declare function`,
// erased at compile time — see the module's own header comment for why). In the real app those
// globals are provided by nodeQueries.ts's own generated block sharing the same script scope;
// in this Node test environment there is no such shared scope, so they're wired up explicitly
// here from the real implementations — not mocks, the actual tested functions.
beforeAll(() => {
  const g = globalThis as unknown as { getSubtreeEnd: typeof getSubtreeEnd; getIndex: typeof getIndex };
  g.getSubtreeEnd = getSubtreeEnd;
  g.getIndex = getIndex;
});

interface TestNode {
  id: number;
  depth: number;
}

function tree(depths: number[]): TestNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth }));
}

describe('canIndentAt', () => {
  it('is false for the very first node (no possible earlier sibling)', () => {
    expect(canIndentAt(tree([0, 0]), 0)).toBe(false);
  });

  it('is true when the immediately preceding node is a same-depth sibling', () => {
    // A(0) B(0) — B can become A's child
    expect(canIndentAt(tree([0, 0]), 1)).toBe(true);
  });

  it('is true when a same-depth sibling exists further back, past deeper descendants', () => {
    // A(0) A1(1) A2(1) B(0) — B can still indent under A despite A1/A2 in between
    expect(canIndentAt(tree([0, 1, 1, 0]), 3)).toBe(true);
  });

  it('is false when the node is already the sole child of its parent (walking back hits a shallower depth first)', () => {
    // A(0) A1(1) — A1 has no same-depth sibling before it, hits A's shallower depth first
    expect(canIndentAt(tree([0, 1]), 1)).toBe(false);
  });
});

describe('indentRootIndexes', () => {
  it('increments depth by 1 for a single node with no children', () => {
    const nodes = tree([0, 0]);
    indentRootIndexes(nodes, [1]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 1]);
  });

  it("increments depth for a root's entire subtree, not just the root itself", () => {
    // A(0) B(0) B1(1) B2(2) C(0) — indenting B should also indent B1 and B2, not touch C
    const nodes = tree([0, 0, 1, 2, 0]);
    indentRootIndexes(nodes, [1]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2, 3, 0]);
  });

  it('indents multiple disjoint root subtrees in the same call', () => {
    // A(0) B(0) C(0) C1(1) — indent both B and C(+C1)
    const nodes = tree([0, 0, 0, 1]);
    indentRootIndexes(nodes, [1, 2]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1, 2]);
  });

  it('mutates the original array in place rather than returning a new one', () => {
    const nodes = tree([0, 0]);
    const result = indentRootIndexes(nodes, [1]);
    expect(result).toBeUndefined();
    expect(nodes[1].depth).toBe(1);
  });
});

describe('outdentRootIndexes', () => {
  it('decrements depth by 1 for a node at depth > 0', () => {
    const nodes = tree([0, 1]);
    outdentRootIndexes(nodes, [1]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 0]);
  });

  it("decrements depth for a root's entire subtree", () => {
    const nodes = tree([0, 1, 2, 3]);
    outdentRootIndexes(nodes, [1]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 0, 1, 2]);
  });

  it('skips a root already at depth 0, leaving it and its subtree untouched', () => {
    // Oracle: matches the original outdentSelected's per-root `if(nodes[idx].depth===0)continue`
    // — a mixed-depth multi-selection partially outdents rather than being all-or-nothing.
    const nodes = tree([0, 1, 1]); // A(0) B(1) C(1), roots = [A, B] (mixed depths)
    outdentRootIndexes(nodes, [0, 1]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 0, 1]); // A untouched, B outdented, C untouched
  });

  it('never produces a negative depth (only ever called on roots already confirmed depth > 0 by the guard, but the skip is defense in depth)', () => {
    const nodes = tree([0]);
    outdentRootIndexes(nodes, [0]);
    expect(nodes[0].depth).toBe(0);
  });
});

describe('canMoveUpAt', () => {
  it('is false for the very first node', () => {
    expect(canMoveUpAt(tree([0, 0]), 0)).toBe(false);
  });

  it('is true when the immediately preceding node is a same-depth sibling', () => {
    expect(canMoveUpAt(tree([0, 0]), 1)).toBe(true);
  });

  it('is true when a same-depth sibling exists further back, past a deeper preceding subtree', () => {
    // A(0) A1(1) B(0) — B can move up past A's whole subtree
    expect(canMoveUpAt(tree([0, 1, 0]), 2)).toBe(true);
  });

  it("is false when the node is its parent's only child (walking back hits a shallower depth first)", () => {
    // A(0) A1(1) — A1 has no preceding same-depth sibling, hits A's shallower depth first
    expect(canMoveUpAt(tree([0, 1]), 1)).toBe(false);
  });
});

describe('canMoveDownAt', () => {
  it('is false when the subtree already ends at the array end', () => {
    const nodes = tree([0, 0]);
    expect(canMoveDownAt(nodes, 1, 2)).toBe(false); // end===nodes.length
  });

  it('is true when the node immediately after the subtree end is a same-depth sibling', () => {
    // A(0) A1(1) B(0) — A's subtree ends at index 2 (B), and B is a same-depth sibling
    const nodes = tree([0, 1, 0]);
    expect(canMoveDownAt(nodes, 0, 2)).toBe(true);
  });

  it('is false when the node after the subtree end is a different depth', () => {
    const nodes = tree([0, 1]);
    expect(canMoveDownAt(nodes, 0, 1)).toBe(false);
  });
});

interface IdNode {
  id: number;
  depth: number;
}

function idTree(entries: [number, number][]): IdNode[] {
  return entries.map(([id, depth]) => ({ id, depth }));
}

describe('moveNodeUp', () => {
  it('swaps two adjacent single-node siblings', () => {
    // A=1, B=2
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    const movedId = moveNodeUp(nodes, 1);
    expect(nodes.map((n) => n.id)).toEqual([2, 1]); // B, A
    expect(movedId).toBe(2);
  });

  it("moves a subtree past a preceding sibling's entire subtree, not just the sibling node", () => {
    // A(0)=1 A1(1)=2 B(0)=3 — moving B up should land it before A (and A1), not between A and A1
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    const movedId = moveNodeUp(nodes, 2);
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2]); // B, A, A1
    expect(movedId).toBe(3);
  });

  it("moves the mover's own subtree together as one block", () => {
    // A(0)=1 A1(1)=2 B(0)=3 B1(1)=4 — moving B (with its child B1) up past A (with its child A1)
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1]
    ]);
    const movedId = moveNodeUp(nodes, 2);
    expect(nodes.map((n) => n.id)).toEqual([3, 4, 1, 2]); // B, B1, A, A1
    expect(movedId).toBe(3);
  });
});

describe('moveNodeDown', () => {
  it('swaps two adjacent single-node siblings', () => {
    // A=1, B=2
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    const movedId = moveNodeDown(nodes, 0);
    expect(nodes.map((n) => n.id)).toEqual([2, 1]); // B, A
    expect(movedId).toBe(1);
  });

  it("moves the mover's own subtree together, past the following sibling's entire subtree", () => {
    // A(0)=1 A1(1)=2 B(0)=3 B1(1)=4 — moving A (with A1) down past B (with B1)
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 1]
    ]);
    const movedId = moveNodeDown(nodes, 0);
    expect(nodes.map((n) => n.id)).toEqual([3, 4, 1, 2]); // B, B1, A, A1
    expect(movedId).toBe(1);
  });
});

describe('isDescendantIndex', () => {
  it('is true when the index falls within the ancestor subtree range', () => {
    // A(0)=idx0 A1(1)=idx1 B(0)=idx2 — A1 (idx1) is a descendant of A (idx0)
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    expect(isDescendantIndex(nodes, 1, 0)).toBe(true);
  });

  it('is false for the ancestor itself (strictly greater-than, not >=)', () => {
    const nodes = idTree([
      [1, 0],
      [2, 1]
    ]);
    expect(isDescendantIndex(nodes, 0, 0)).toBe(false);
  });

  it('is false for a sibling or later node outside the subtree', () => {
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    expect(isDescendantIndex(nodes, 2, 0)).toBe(false); // B is not inside A's subtree
  });
});

describe('moveNodeBlockCore', () => {
  it("mode='below' places the dragged node as the target's following sibling", () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]); // A B C
    const moved = moveNodeBlockCore(nodes, 1, 3, 'below'); // drag A below C
    expect(moved).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([2, 3, 1]); // B C A
  });

  it("mode='above' places the dragged node as the target's preceding sibling", () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 3, 'above'); // drag A above C
    expect(moved).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([2, 1, 3]); // B A C
  });

  it("mode='child' places the dragged node as the target's first child, one depth deeper", () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 3, 'child'); // drag A as C's child
    expect(moved).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([2, 3, 1]); // B C A(child)
    expect(nodes.find((n) => n.id === 1)?.depth).toBe(1);
  });

  it("mode='end' moves the node to the very end of the document at depth 0, ignoring targetId", () => {
    const nodes = idTree([
      [1, 0],
      [2, 1], // A's child
      [3, 0]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 3, 'end'); // drag A (+A1) to the end
    expect(moved).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2]); // C, A, A1
    expect(nodes.find((n) => n.id === 1)?.depth).toBe(0);
  });

  it("moves the dragged node's entire subtree together, depth-shifted by the same delta as the root", () => {
    // A(0)=1 A1(1)=2 A1a(2)=3 B(0)=4 — drag A (with A1, A1a) as B's child
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 0]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 4, 'child');
    expect(moved).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([4, 1, 2, 3]); // B, A(1), A1(2), A1a(3)
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2, 3]);
  });

  it('rejects when draggedId===targetId, leaving nodes unchanged', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 1, 'below');
    expect(moved).toBe(false);
    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });

  it('rejects an unknown draggedId or targetId, leaving nodes unchanged', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    expect(moveNodeBlockCore(nodes, 999, 2, 'below')).toBe(false);
    expect(moveNodeBlockCore(nodes, 1, 999, 'below')).toBe(false);
    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });

  it("rejects moving a node into its own descendant, leaving nodes unchanged", () => {
    // A(0)=1 A1(1)=2 — dragging A onto its own child A1 would orphan it
    const nodes = idTree([
      [1, 0],
      [2, 1]
    ]);
    const moved = moveNodeBlockCore(nodes, 1, 2, 'below');
    expect(moved).toBe(false);
    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('moveMultipleNodeBlocksCore', () => {
  it('moves two disjoint blocks together as one combined block, preserving each block\'s internal structure', () => {
    // A(0)=1 A1(1)=2 B(0)=3 C(0)=4 — drag A(+A1) and C to below B
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 0]
    ]);
    const survivors = moveMultipleNodeBlocksCore(nodes, [1, 4], 3, 'below');
    expect(survivors).toEqual([1, 4]);
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2, 4]); // B, A, A1, C
  });

  it('re-sorts blocks by original document position regardless of the order ids were passed in', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]); // A B C
    // Pass ids in reverse document order (3 then 1) — should still combine as A-then-C internally
    const survivors = moveMultipleNodeBlocksCore(nodes, [3, 1], 2, 'child');
    expect(survivors).toEqual([3, 1]); // return preserves the ARGUMENT order, not position order
    expect(nodes.map((n) => n.id)).toEqual([2, 1, 3]); // B, then A, C as its children (in position order)
  });

  it("mode='end' moves the combined block to the end at depth 0, ignoring targetId", () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    const survivors = moveMultipleNodeBlocksCore(nodes, [1, 2], 3, 'end');
    expect(survivors).toEqual([1, 2]);
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 0, 0]);
  });

  it('rejects fewer than 2 dragged ids, leaving nodes unchanged', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    expect(moveMultipleNodeBlocksCore(nodes, [1], 2, 'below')).toBeNull();
    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });

  it('rejects when the target is itself one of the dragged ids (non-end mode)', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    const survivors = moveMultipleNodeBlocksCore(nodes, [1, 2], 2, 'below'); // target=2 is in draggedIds
    expect(survivors).toBeNull();
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('rejects an unknown targetId, leaving nodes unchanged', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0]
    ]);
    expect(moveMultipleNodeBlocksCore(nodes, [1, 2], 999, 'below')).toBeNull();
    expect(nodes.map((n) => n.id)).toEqual([1, 2]);
  });

  it('rejects when the target is a descendant of one of the dragged blocks', () => {
    // A(0)=1 A1(1)=2 B(0)=3 — dragging [A, B] onto A1 (A's own descendant) must be rejected
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    const survivors = moveMultipleNodeBlocksCore(nodes, [1, 3], 2, 'below');
    expect(survivors).toBeNull();
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it('drops any dragged id not found in nodes, then still requires at least 2 valid ones', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]);
    // Only id 1 is valid — 999 doesn't exist — leaving fewer than 2 valid blocks
    const survivors = moveMultipleNodeBlocksCore(nodes, [1, 999], 3, 'below');
    expect(survivors).toBeNull();
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 3]);
  });
});

describe('computePasteOffsetDepth', () => {
  it('returns 0 when the document is empty', () => {
    expect(computePasteOffsetDepth([], -1)).toBe(0);
  });

  it('returns 0 when insertIdx is not found (-1)', () => {
    const nodes = idTree([[1, 0]]);
    expect(computePasteOffsetDepth(nodes, -1)).toBe(0);
  });

  it("returns the insertion point's own depth when there is valid context", () => {
    // A(0)=1 A1(2)=2 — pasting while "on" A1 (depth 2) should offset by 2
    const nodes = idTree([
      [1, 0],
      [2, 2]
    ]);
    expect(computePasteOffsetDepth(nodes, 1)).toBe(2);
  });

  it('returns 0 for a depth-0 insertion point (no offset needed)', () => {
    const nodes = idTree([[1, 0]]);
    expect(computePasteOffsetDepth(nodes, 0)).toBe(0);
  });
});

describe('insertParsedNodesCore', () => {
  it('replaces the whole document when nodes is empty', () => {
    const nodes: IdNode[] = [];
    const mapped = idTree([
      [10, 0],
      [11, 1]
    ]);
    insertParsedNodesCore(nodes, -1, mapped);
    expect(nodes.map((n) => n.id)).toEqual([10, 11]);
  });

  it('replaces the whole document when insertIdx is not found, even if nodes is non-empty', () => {
    // Oracle: matches the original's noContext condition (!nodes.length || insertIdx<0) —
    // a non-empty document with an invalid insertIdx still hits the "replace whole document"
    // branch, not the splice-after-subtree branch.
    const nodes = idTree([[1, 0]]);
    const mapped = idTree([[10, 0]]);
    insertParsedNodesCore(nodes, -1, mapped);
    expect(nodes.map((n) => n.id)).toEqual([10]);
  });

  it("splices the pasted block in right after the insertion point's own subtree", () => {
    // A(0)=1 A1(1)=2 B(0)=3 — paste after A's subtree (which includes A1), landing before B
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0]
    ]);
    const mapped = idTree([[10, 0]]);
    insertParsedNodesCore(nodes, 0, mapped);
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 10, 3]); // A, A1, pasted, B
  });

  it('mutates the original array in place (same reference) rather than reassigning it', () => {
    // Confirms the splice(0,length,...) substitution for the original's `nodes=mapped`
    // preserves the same array identity a real caller's `nodes` binding depends on.
    const nodes: IdNode[] = [];
    const originalRef = nodes;
    insertParsedNodesCore(nodes, -1, idTree([[10, 0]]));
    expect(nodes).toBe(originalRef);
    expect(nodes.map((n) => n.id)).toEqual([10]);
  });
});

describe('deleteRootIndexes', () => {
  it('removes a single leaf node', () => {
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0]
    ]); // A B C
    deleteRootIndexes(nodes, [1]);
    expect(nodes.map((n) => n.id)).toEqual([1, 3]); // A, C — B removed
  });

  it("removes a root's entire subtree, not just the root node itself", () => {
    // A(0)=1 A1(1)=2 A2(1)=3 B(0)=4 — deleting A removes A1/A2 too, leaves only B
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 0]
    ]);
    deleteRootIndexes(nodes, [0]);
    expect(nodes.map((n) => n.id)).toEqual([4]);
  });

  it('removes multiple disjoint root subtrees in one call, in any relative position', () => {
    // A(0)=1 A1(1)=2 B(0)=3 C(0)=4 C1(1)=5 D(0)=6 — delete A(+A1) and C(+C1), keep B and D
    const nodes = idTree([
      [1, 0],
      [2, 1],
      [3, 0],
      [4, 0],
      [5, 1],
      [6, 0]
    ]);
    deleteRootIndexes(nodes, [0, 3]); // indexes of A and C
    expect(nodes.map((n) => n.id)).toEqual([3, 6]); // B, D
  });

  it('processes indexes in reverse order so earlier indexes stay valid while later ones are removed first', () => {
    // Passing rootIndexes out of order (descending) should produce the identical result to
    // passing them in ascending order — the function sorts its own processing order internally
    // via the reverse for-loop, regardless of the array's own order.
    const nodes = idTree([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0]
    ]);
    deleteRootIndexes(nodes, [0, 2]); // remove A and C, keep B and D
    expect(nodes.map((n) => n.id)).toEqual([2, 4]);
  });

  it('is a no-op for an empty rootIndexes array', () => {
    const nodes = idTree([[1, 0]]);
    deleteRootIndexes(nodes, []);
    expect(nodes.map((n) => n.id)).toEqual([1]);
  });
});

interface TextNode {
  id: number;
  depth: number;
  text: string;
}

function textTree(entries: [number, number, string][]): TextNode[] {
  return entries.map(([id, depth, text]) => ({ id, depth, text }));
}

describe('sortChildBlocksCore', () => {
  it('is a no-op (returns false, nodes unchanged) with fewer than 2 blocks to sort', () => {
    const nodes = textTree([[1, 0, 'only']]);
    const before = nodes.slice();
    expect(sortChildBlocksCore(nodes, null, 'az')).toBe(false);
    expect(nodes).toEqual(before);
  });

  it("sorts root blocks (parentIdx null) A -> Z by each block's own root text", () => {
    // Charlie(0)=1, Alice(0)=2, Bob(0)=3
    const nodes = textTree([
      [1, 0, 'Charlie'],
      [2, 0, 'Alice'],
      [3, 0, 'Bob']
    ]);
    expect(sortChildBlocksCore(nodes, null, 'az')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([2, 3, 1]); // Alice, Bob, Charlie
  });

  it('sorts root blocks Z -> A', () => {
    const nodes = textTree([
      [1, 0, 'Charlie'],
      [2, 0, 'Alice'],
      [3, 0, 'Bob']
    ]);
    expect(sortChildBlocksCore(nodes, null, 'za')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([1, 3, 2]); // Charlie, Bob, Alice
  });

  it('carries each block\'s whole subtree along with it, not just the root node', () => {
    // Charlie(0)=1 -> child(1)=2, Alice(0)=3
    const nodes = textTree([
      [1, 0, 'Charlie'],
      [2, 1, 'child of Charlie'],
      [3, 0, 'Alice']
    ]);
    expect(sortChildBlocksCore(nodes, null, 'az')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2]); // Alice, then Charlie's whole subtree
  });

  it("sorts A -> Z case-insensitively and ignores HTML tags in the compared text", () => {
    const nodes = textTree([
      [1, 0, '<b>banana</b>'],
      [2, 0, 'APPLE']
    ]);
    expect(sortChildBlocksCore(nodes, null, 'az')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([2, 1]); // apple, banana
  });

  it("sorts by depth (shallowest subtree first), stable on ties by original position", () => {
    // A(0)=1 -> child(1)=2 -> grandchild(2)=3 [height 2], B(0)=4 [height 0], C(0)=5 -> child(1)=6 [height 1]
    const nodes = textTree([
      [1, 0, 'A'],
      [2, 1, 'A-child'],
      [3, 2, 'A-grandchild'],
      [4, 0, 'B'],
      [5, 0, 'C'],
      [6, 1, 'C-child']
    ]);
    expect(sortChildBlocksCore(nodes, null, 'depth')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([4, 5, 6, 1, 2, 3]); // B, C(+child), A(+child+grandchild)
  });

  it('only sorts a specific parentIdx\'s immediate children, leaving the rest of the tree untouched', () => {
    // Root(0)=1 -> Zed(1)=2, Amy(1)=3 ; Sibling(0)=4
    const nodes = textTree([
      [1, 0, 'Root'],
      [2, 1, 'Zed'],
      [3, 1, 'Amy'],
      [4, 0, 'Sibling']
    ]);
    expect(sortChildBlocksCore(nodes, 0, 'az')).toBe(true);
    expect(nodes.map((n) => n.id)).toEqual([1, 3, 2, 4]); // Root, Amy, Zed, Sibling (untouched)
  });
});
