import { describe, it, expect, beforeAll } from 'vitest';
import {
  diagramGenIsContainerCore,
  diagramGenIsSequenceCore,
  diagramGenIsHorizontalCore,
  diagramGenAllChildIdxsCore,
  diagramGenHasEdgeLabelTagCore,
  diagramGenChildIdxsCore,
  diagramGenIsLeafCore,
  diagramGenIsChainGroupCore,
  diagramGenChainHeaderSuppressedCore,
  diagramGenIsConfirmedEdgeLabelCore,
  diagramGenIsPassthroughCore,
  diagramGenIsMergeCandidateCore,
  diagramGenRenderChildIdxsCore,
  diagramGenChainTailIdxCore,
  diagramGenEdgeLabelBeforeCore,
  type TopologyNode,
  type NodeMetaEntry
} from '../../src/state/diagramGenTopology';
import { getSubtreeEnd, getParentIndex } from '../../src/core/nodeQueries';
import { stripSemanticMarkers } from '../../src/utils/stripSemanticMarkers';
import { diagramGenHardTruncateCore } from '../../src/core/diagramGenDims';

// diagramGenTopology.ts references getSubtreeEnd/getParentIndex/stripSemanticMarkers/
// diagramGenHardTruncateCore as ambient globals (declare function, erased at compile time — see
// the module's own header for why). In the real app these globals are provided by their own
// already-generated blocks sharing the same script scope; in this Node test environment there is
// no such shared scope, so they're wired up explicitly here from the real implementations — not
// mocks, the actual tested functions.
beforeAll(() => {
  const g = globalThis as unknown as {
    getSubtreeEnd: typeof getSubtreeEnd;
    getParentIndex: typeof getParentIndex;
    stripSemanticMarkers: typeof stripSemanticMarkers;
    diagramGenHardTruncateCore: typeof diagramGenHardTruncateCore;
  };
  g.getSubtreeEnd = getSubtreeEnd;
  g.getParentIndex = getParentIndex;
  g.stripSemanticMarkers = stripSemanticMarkers;
  g.diagramGenHardTruncateCore = diagramGenHardTruncateCore;
});

function tree(depths: number[], texts?: (string | undefined)[], tags?: (string[] | undefined)[]): TopologyNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth, text: texts?.[i], tags: tags?.[i] }));
}

function meta(entries: Record<number, NodeMetaEntry>): Map<number, NodeMetaEntry> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
}

// Pinned local oracle — literal copy of index.html's current diagramGen* topology functions
// (pre-extraction), adapted to take `nodes` as an explicit closure variable rather than a true
// ambient global, same approach as nodeMutations.test.ts.
function buildOracle(nodes: TopologyNode[]) {
  function isContainer(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined) {
    const m = nodeMeta && nodeMeta.get(nodes[idx].id);
    return !!(m && m.container);
  }
  function isSequence(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined) {
    const m = nodeMeta && nodeMeta.get(nodes[idx].id);
    return !!(m && m.sequence);
  }
  function allChildIdxs(idx: number): number[] {
    const node = nodes[idx];
    const end = getSubtreeEnd(nodes, idx);
    const out: number[] = [];
    for (let i = idx + 1; i < end; i++) {
      if (nodes[i].depth === node.depth + 1) out.push(i);
    }
    return out;
  }
  function isLeaf(idx: number): boolean {
    return allChildIdxs(idx).length === 0;
  }
  function isChainGroup(idx: number): boolean {
    const kids = allChildIdxs(idx);
    return kids.length > 1 && kids.every(isLeaf);
  }
  function isConfirmedEdgeLabel(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined): boolean {
    const m = nodeMeta && nodeMeta.get(nodes[idx].id);
    if (!m || m.shape !== 'edge-label') return false;
    const parentIdx = getParentIndex(nodes, idx);
    if (parentIdx < 0) return false;
    const siblings = allChildIdxs(parentIdx);
    const pos = siblings.indexOf(idx);
    return siblings.slice(pos + 1).some((si) => {
      const sm = nodeMeta!.get(nodes[si].id);
      return !(sm && sm.shape === 'edge-label');
    });
  }
  function isPassthrough(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined): boolean {
    const m = nodeMeta && nodeMeta.get(nodes[idx].id);
    return !!(m && m.shape === 'passthrough');
  }
  function isMergeCandidate(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined): boolean {
    const m = nodeMeta && nodeMeta.get(nodes[idx].id);
    if (m && (m.shape || m.container)) return false;
    if (allChildIdxs(idx).length > 0) return false;
    const parentIdx = getParentIndex(nodes, idx);
    if (parentIdx < 0) return false;
    if (isContainer(parentIdx, nodeMeta) || isPassthrough(parentIdx, nodeMeta) || isConfirmedEdgeLabel(parentIdx, nodeMeta)) return false;
    const realSiblings = allChildIdxs(parentIdx).filter((si) => !isConfirmedEdgeLabel(si, nodeMeta));
    return realSiblings.length === 1 && realSiblings[0] === idx;
  }
  function renderChildIdxs(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined): number[] {
    const out: number[] = [];
    allChildIdxs(idx).forEach((ci) => {
      if (isConfirmedEdgeLabel(ci, nodeMeta)) return;
      if (isMergeCandidate(ci, nodeMeta)) return;
      if (isPassthrough(ci, nodeMeta)) {
        out.push(...renderChildIdxs(ci, nodeMeta));
        return;
      }
      out.push(ci);
    });
    return out;
  }
  function chainTailIdx(idx: number, nodeMeta: Map<number, NodeMetaEntry> | undefined): number {
    const kids = renderChildIdxs(idx, nodeMeta);
    if (!kids.length) return idx;
    if (!isSequence(idx, nodeMeta)) return idx;
    return chainTailIdx(kids[kids.length - 1], nodeMeta);
  }
  return { isContainer, isSequence, allChildIdxs, isLeaf, isChainGroup, isConfirmedEdgeLabel, isPassthrough, isMergeCandidate, renderChildIdxs, chainTailIdx };
}

describe('diagramGenIsContainerCore / IsSequenceCore / IsHorizontalCore', () => {
  it('reads container/sequence/direction from nodeMeta, false/undefined when unset', () => {
    const t = tree([0]);
    expect(diagramGenIsContainerCore(t, 0, undefined)).toBe(false);
    expect(diagramGenIsSequenceCore(t, 0, undefined)).toBe(false);
    expect(diagramGenIsHorizontalCore(t, 0, undefined)).toBe(false);

    const m = meta({ 1: { container: true, sequence: true, direction: 'horizontal' } });
    expect(diagramGenIsContainerCore(t, 0, m)).toBe(true);
    expect(diagramGenIsSequenceCore(t, 0, m)).toBe(true);
    expect(diagramGenIsHorizontalCore(t, 0, m)).toBe(true);
  });

  it('direction defaults to non-horizontal (vertical) when unset or anything other than "horizontal"', () => {
    const t = tree([0]);
    const m = meta({ 1: { direction: 'vertical' } });
    expect(diagramGenIsHorizontalCore(t, 0, m)).toBe(false);
  });
});

describe('diagramGenAllChildIdxsCore / ChildIdxsCore / IsLeafCore / IsChainGroupCore', () => {
  it('returns direct children one depth level down, no grandchildren', () => {
    // 0:root(0) -> 1:a(1) -> 2:aa(2), 3:b(1)
    const t = tree([0, 1, 2, 1]);
    expect(diagramGenAllChildIdxsCore(t, 0)).toEqual([1, 3]);
    expect(diagramGenChildIdxsCore(t, 0)).toEqual([1, 3]);
  });

  it('a leaf has no children', () => {
    const t = tree([0, 1]);
    expect(diagramGenIsLeafCore(t, 1)).toBe(true);
    expect(diagramGenIsLeafCore(t, 0)).toBe(false);
  });

  it('a chain group is 2+ children, all leaves', () => {
    const t = tree([0, 1, 1, 1]);
    expect(diagramGenIsChainGroupCore(t, 0)).toBe(true);
  });

  it('a single child is not a chain group (needs more than one)', () => {
    const t = tree([0, 1]);
    expect(diagramGenIsChainGroupCore(t, 0)).toBe(false);
  });

  it('a chain group is false if any child has its own children', () => {
    const t = tree([0, 1, 2, 1]);
    expect(diagramGenIsChainGroupCore(t, 0)).toBe(false);
  });
});

describe('diagramGenHasEdgeLabelTagCore', () => {
  it('true for #edge-label or #edgelabel tags, case-insensitive', () => {
    const t = tree([0, 0, 0], undefined, [['edge-label'], ['EdgeLabel'], ['other']]);
    expect(diagramGenHasEdgeLabelTagCore(t, 0)).toBe(true);
    expect(diagramGenHasEdgeLabelTagCore(t, 1)).toBe(true);
    expect(diagramGenHasEdgeLabelTagCore(t, 2)).toBe(false);
  });

  it('false when tags is missing/not an array', () => {
    const t = tree([0]);
    expect(diagramGenHasEdgeLabelTagCore(t, 0)).toBe(false);
  });
});

describe('diagramGenChainHeaderSuppressedCore', () => {
  it('is an alias for diagramGenIsContainerCore', () => {
    const t = tree([0]);
    const m = meta({ 1: { container: true } });
    expect(diagramGenChainHeaderSuppressedCore(t, 0, m)).toBe(diagramGenIsContainerCore(t, 0, m));
    expect(diagramGenChainHeaderSuppressedCore(t, 0, undefined)).toBe(false);
  });
});

describe('diagramGenIsConfirmedEdgeLabelCore', () => {
  it('false when shape is not edge-label', () => {
    const t = tree([0, 1, 1]);
    expect(diagramGenIsConfirmedEdgeLabelCore(t, 1, undefined)).toBe(false);
  });

  it('false at root (no parent)', () => {
    const t = tree([0]);
    const m = meta({ 1: { shape: 'edge-label' } });
    expect(diagramGenIsConfirmedEdgeLabelCore(t, 0, m)).toBe(false);
  });

  it('true when shape is edge-label AND a real (non-edge-label) sibling follows it', () => {
    // root -> a(edge-label), b(real)
    const t = tree([0, 1, 1]);
    const m = meta({ 2: { shape: 'edge-label' } });
    expect(diagramGenIsConfirmedEdgeLabelCore(t, 1, m)).toBe(true);
  });

  it('false when no real sibling follows it (nothing for the label to attach to)', () => {
    // root -> a(real), b(edge-label) — b is last, nothing follows
    const t = tree([0, 1, 1]);
    const m = meta({ 3: { shape: 'edge-label' } });
    expect(diagramGenIsConfirmedEdgeLabelCore(t, 2, m)).toBe(false);
  });

  it('false when only other edge-label nodes follow it (still nothing real to attach to)', () => {
    const t = tree([0, 1, 1, 1]);
    const m = meta({ 2: { shape: 'edge-label' }, 3: { shape: 'edge-label' }, 4: { shape: 'edge-label' } });
    expect(diagramGenIsConfirmedEdgeLabelCore(t, 1, m)).toBe(false);
  });
});

describe('diagramGenIsPassthroughCore', () => {
  it('true only when shape is exactly "passthrough"', () => {
    const t = tree([0]);
    expect(diagramGenIsPassthroughCore(t, 0, meta({ 1: { shape: 'passthrough' } }))).toBe(true);
    expect(diagramGenIsPassthroughCore(t, 0, meta({ 1: { shape: 'ui' } }))).toBe(false);
    expect(diagramGenIsPassthroughCore(t, 0, undefined)).toBe(false);
  });
});

describe('diagramGenIsMergeCandidateCore', () => {
  it('true for the sole real leaf child of a plain-box parent', () => {
    const t = tree([0, 1]);
    expect(diagramGenIsMergeCandidateCore(t, 1, undefined)).toBe(true);
  });

  it('false when the node itself has a shape or is a container', () => {
    const t = tree([0, 1]);
    expect(diagramGenIsMergeCandidateCore(t, 1, meta({ 2: { shape: 'ui' } }))).toBe(false);
    expect(diagramGenIsMergeCandidateCore(t, 1, meta({ 2: { container: true } }))).toBe(false);
  });

  it('false when the node has its own children', () => {
    const t = tree([0, 1, 2]);
    expect(diagramGenIsMergeCandidateCore(t, 1, undefined)).toBe(false);
  });

  it('false at root (no parent)', () => {
    const t = tree([0]);
    expect(diagramGenIsMergeCandidateCore(t, 0, undefined)).toBe(false);
  });

  it('false when the parent is a container/passthrough/confirmed-edge-label', () => {
    const t = tree([0, 1]);
    expect(diagramGenIsMergeCandidateCore(t, 1, meta({ 1: { container: true } }))).toBe(false);
    expect(diagramGenIsMergeCandidateCore(t, 1, meta({ 1: { shape: 'passthrough' } }))).toBe(false);
  });

  it('false when there is more than one real sibling', () => {
    const t = tree([0, 1, 1]);
    expect(diagramGenIsMergeCandidateCore(t, 1, undefined)).toBe(false);
  });

  it('true when the only OTHER sibling is a confirmed edge-label (so only one real sibling remains)', () => {
    // root -> label(edge-label), real(leaf) — label is confirmed (a real sibling follows it),
    // so the real leaf ends up as the parent's sole real child once the label is excluded.
    const t = tree([0, 1, 1]);
    const m = meta({ 2: { shape: 'edge-label' } });
    expect(diagramGenIsMergeCandidateCore(t, 2, m)).toBe(true);
  });
});

describe('diagramGenRenderChildIdxsCore', () => {
  it('returns raw children when none are filtered/spliced', () => {
    const t = tree([0, 1, 1]);
    expect(diagramGenRenderChildIdxsCore(t, 0, undefined)).toEqual([1, 2]);
  });

  it('drops a confirmed edge-label child, keeps two other real leaves untouched', () => {
    // root -> label(edge-label), real, real — two real leaves remain after the drop, so neither
    // becomes a merge candidate (that needs exactly one real sibling left).
    const t = tree([0, 1, 1, 1]);
    const m = meta({ 2: { shape: 'edge-label' } });
    expect(diagramGenRenderChildIdxsCore(t, 0, m)).toEqual([2, 3]);
  });

  it('splices a passthrough child\'s own render-children into its place', () => {
    // root -> wrapper(passthrough) -> x, y
    const t = tree([0, 1, 2, 2]);
    const m = meta({ 2: { shape: 'passthrough' } });
    expect(diagramGenRenderChildIdxsCore(t, 0, m)).toEqual([2, 3]);
  });

  it('drops a merge-candidate child', () => {
    const t = tree([0, 1]);
    expect(diagramGenRenderChildIdxsCore(t, 0, undefined)).toEqual([]);
  });
});

describe('diagramGenChainTailIdxCore', () => {
  it('returns idx itself when it has no render-children', () => {
    const t = tree([0]);
    expect(diagramGenChainTailIdxCore(t, 0, undefined)).toBe(0);
  });

  it('returns idx itself when it is not a confirmed sequence, even with children', () => {
    const t = tree([0, 1, 1]);
    expect(diagramGenChainTailIdxCore(t, 0, undefined)).toBe(0);
  });

  it('recurses to the last child, repeatedly, while sequence is confirmed', () => {
    // root(sequence) -> a(sequence) -> b, c  — root is sequence, last child a; a is sequence,
    // last render-child is c (idx3); c is not itself a sequence, so tail is c.
    const t = tree([0, 1, 2, 2]);
    const m = meta({ 1: { sequence: true }, 2: { sequence: true } });
    expect(diagramGenChainTailIdxCore(t, 0, m)).toBe(3);
  });
});

describe('diagramGenEdgeLabelBeforeCore', () => {
  it('maps a real rendered child to the truncated text of the edge-label node before it', () => {
    // root -> label(edge-label, text "goes here"), real, real — two real leaves after the label
    // so neither is itself a merge candidate, keeping this test isolated to the label-mapping
    // behavior rather than also exercising the merge-candidate skip.
    const t = tree([0, 1, 1, 1], [undefined, 'goes here', undefined, undefined]);
    const m = meta({ 2: { shape: 'edge-label' } });
    const result = diagramGenEdgeLabelBeforeCore(t, 0, m);
    expect(result.get(2)).toBe('goes here');
  });

  it('returns an empty map when there is no confirmed edge-label child', () => {
    const t = tree([0, 1, 1]);
    expect(diagramGenEdgeLabelBeforeCore(t, 0, undefined).size).toBe(0);
  });

  it('a passthrough child does not consume the pending label — it carries through to the next real child', () => {
    // root -> label(edge-label, text "lbl"), passthrough(no children of its own), real
    const t = tree([0, 1, 1, 1], [undefined, 'lbl', undefined, undefined]);
    const m = meta({ 2: { shape: 'edge-label' }, 3: { shape: 'passthrough' } });
    const result = diagramGenEdgeLabelBeforeCore(t, 0, m);
    expect(result.has(2)).toBe(false); // the passthrough node itself never receives the label
    expect(result.get(3)).toBe('lbl'); // it lands on the next real child instead
  });
});

describe('oracle comparison across representative trees', () => {
  it.each([
    { depths: [0, 1, 1], m: {} },
    { depths: [0, 1, 1], m: { 2: { shape: 'edge-label' } } },
    { depths: [0, 1, 2, 1], m: {} },
    { depths: [0, 1, 2, 2, 1], m: { 2: { sequence: true }, 5: { container: true } } },
    { depths: [0, 1, 1, 1, 1], m: { 2: { shape: 'edge-label' }, 4: { shape: 'edge-label' } } }
  ])('matches the oracle for depths=%j meta=%j', ({ depths, m }) => {
    const t = tree(depths);
    const nodeMeta = meta(m as Record<number, NodeMetaEntry>);
    const oracle = buildOracle(t);
    for (let idx = 0; idx < t.length; idx++) {
      expect(diagramGenIsLeafCore(t, idx)).toBe(oracle.isLeaf(idx));
      expect(diagramGenIsChainGroupCore(t, idx)).toBe(oracle.isChainGroup(idx));
      expect(diagramGenIsMergeCandidateCore(t, idx, nodeMeta)).toBe(oracle.isMergeCandidate(idx, nodeMeta));
      expect(diagramGenIsConfirmedEdgeLabelCore(t, idx, nodeMeta)).toBe(oracle.isConfirmedEdgeLabel(idx, nodeMeta));
      expect(diagramGenRenderChildIdxsCore(t, idx, nodeMeta)).toEqual(oracle.renderChildIdxs(idx, nodeMeta));
      expect(diagramGenChainTailIdxCore(t, idx, nodeMeta)).toBe(oracle.chainTailIdx(idx, nodeMeta));
    }
  });
});
