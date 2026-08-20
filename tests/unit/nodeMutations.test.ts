import { describe, it, expect, beforeAll } from 'vitest';
import {
  canIndentAt,
  indentRootIndexes,
  outdentRootIndexes,
  canMoveUpAt,
  canMoveDownAt,
  moveNodeUp,
  moveNodeDown
} from '../../src/core/nodeMutations';
import { getSubtreeEnd } from '../../src/core/nodeQueries';

// nodeMutations.ts references getSubtreeEnd as an ambient global (a `declare function`, erased
// at compile time — see the module's own header comment for why). In the real app that global
// is provided by nodeQueries.ts's own generated block sharing the same script scope; in this
// Node test environment there is no such shared scope, so it's wired up explicitly here from
// the real implementation — not a mock, the actual tested function.
beforeAll(() => {
  (globalThis as unknown as { getSubtreeEnd: typeof getSubtreeEnd }).getSubtreeEnd = getSubtreeEnd;
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
