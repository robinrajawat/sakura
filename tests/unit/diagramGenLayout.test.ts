import { describe, it, expect, beforeAll } from 'vitest';
import {
  layoutDiagramGenTreeCore,
  type LayoutNode,
  type LayoutNodeMetaEntry,
  type LayoutBoxDims
} from '../../src/state/diagramGenLayout';
import {
  diagramGenRenderChildIdxsCore,
  diagramGenIsSequenceCore,
  diagramGenIsHorizontalCore,
  diagramGenChainHeaderSuppressedCore
} from '../../src/state/diagramGenTopology';
import { getSubtreeEnd, getParentIndex } from '../../src/core/nodeQueries';

// diagramGenLayout.ts references diagramGenRenderChildIdxsCore/IsSequenceCore/IsHorizontalCore/
// ChainHeaderSuppressedCore as ambient globals (declare function, erased at compile time — see
// the module's own header for why). In the real app these globals are provided by
// diagramGenTopology.ts's own generated block sharing the same script scope; in this Node test
// environment there is no such shared scope, so they're wired up explicitly here from the real
// implementations — not mocks, the actual tested functions. diagramGenRenderChildIdxsCore itself
// transitively needs getSubtreeEnd/getParentIndex (from nodeQueries.ts), also wired up here.
beforeAll(() => {
  const g = globalThis as unknown as {
    diagramGenRenderChildIdxsCore: typeof diagramGenRenderChildIdxsCore;
    diagramGenIsSequenceCore: typeof diagramGenIsSequenceCore;
    diagramGenIsHorizontalCore: typeof diagramGenIsHorizontalCore;
    diagramGenChainHeaderSuppressedCore: typeof diagramGenChainHeaderSuppressedCore;
    getSubtreeEnd: typeof getSubtreeEnd;
    getParentIndex: typeof getParentIndex;
  };
  g.diagramGenRenderChildIdxsCore = diagramGenRenderChildIdxsCore;
  g.diagramGenIsSequenceCore = diagramGenIsSequenceCore;
  g.diagramGenIsHorizontalCore = diagramGenIsHorizontalCore;
  g.diagramGenChainHeaderSuppressedCore = diagramGenChainHeaderSuppressedCore;
  g.getSubtreeEnd = getSubtreeEnd;
  g.getParentIndex = getParentIndex;
});

function tree(depths: number[]): LayoutNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth }));
}

function dims(entries: Record<number, LayoutBoxDims>): Map<number, LayoutBoxDims> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
}

function meta(entries: Record<number, LayoutNodeMetaEntry>): Map<number, LayoutNodeMetaEntry> {
  return new Map(Object.entries(entries).map(([k, v]) => [Number(k), v]));
}

// Constants mirrored from index.html's own DIAGRAM_GEN_GAP_X/GAP_Y/GROUP_TITLE_GAP.
const GAP_X = 30;
const GAP_Y = 50;
const GROUP_TITLE_GAP = 22;

describe('layoutDiagramGenTreeCore', () => {
  it('a lone root gets placed at the origin with its own dims', () => {
    const t = tree([0]);
    const d = dims({ 0: { w: 100, h: 44 } });
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, undefined);
    expect(positions.get(0)).toEqual({ x: 0, y: 0 });
  });

  it('a fan-out (2 independent children) places them side by side at the same row', () => {
    // root -> a, b, both 100-wide, root 60-wide
    const t = tree([0, 1, 1]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 100, h: 44 }, 2: { w: 100, h: 44 } });
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, undefined);
    const rowY = 44 + GAP_Y;
    // Total child-row width = 100+30+100 = 230, centered under root's own column width (230,
    // since root's ownW=60 < childRow=230) — root x = 0 + 230/2 - 60/2 = 85.
    expect(positions.get(0)).toEqual({ x: 85, y: 0 });
    // a: left=0, own width slot=100 (its own subtree width, no children) -> x = 0+100/2-100/2=0
    expect(positions.get(1)).toEqual({ x: 0, y: rowY });
    // b: left = 100+30 = 130, own width 100 -> x = 130+100/2-100/2 = 130
    expect(positions.get(2)).toEqual({ x: 130, y: rowY });
  });

  it('a vertical sequence stacks children directly beneath each other, same x column', () => {
    const t = tree([0, 1, 1]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 100, h: 44 }, 2: { w: 80, h: 44 } });
    const nodeMeta = meta({ 1: { sequence: true } }); // node id 1 = root
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, nodeMeta);
    const rowY = 44 + GAP_Y;
    // Vertical sequence column width = max(ownW, max(child widths)) = max(60,100,80) = 100.
    // root centered: x = 0 + 100/2 - 60/2 = 20.
    expect(positions.get(0)).toEqual({ x: 20, y: 0 });
    // child a (w=100): x = 0 + 100/2 - 100/2 = 0, at rowY
    expect(positions.get(1)).toEqual({ x: 0, y: rowY });
    // child b (w=80): stacked below a's bottom (rowY+44) + GAP_Y; x = 0+100/2-80/2 = 10
    const bY = rowY + 44 + GAP_Y;
    expect(positions.get(2)).toEqual({ x: 10, y: bY });
  });

  it('a horizontal sequence places children side by side, vertically centered on the tallest', () => {
    const t = tree([0, 1, 1]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 50, h: 44 }, 2: { w: 50, h: 64 } });
    const nodeMeta = meta({ 1: { sequence: true, direction: 'horizontal' } });
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, nodeMeta);
    const rowY = 44 + GAP_Y;
    // rowMaxOwnH (tallest child, 64) drives the vertical centering offset below.
    // a (h=44): vertical offset = (64-44)/2 = 10 -> y = rowY+10
    expect(positions.get(1)?.y).toBe(rowY + 10);
    // b (h=64): vertical offset = (64-64)/2 = 0 -> y = rowY
    expect(positions.get(2)?.y).toBe(rowY);
  });

  it('a chain-header-suppressed node uses the smaller GROUP_TITLE_GAP instead of GAP_Y', () => {
    const t = tree([0, 1]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 60, h: 44 } });
    const nodeMeta = meta({ 1: { container: true } });
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, nodeMeta);
    expect(positions.get(1)?.y).toBe(44 + GROUP_TITLE_GAP);
  });

  it('multi-root scope places each root side by side, left to right', () => {
    const t = tree([0, 0]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 80, h: 44 } });
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0, 1] }, d, undefined);
    expect(positions.get(0)).toEqual({ x: 0, y: 0 });
    expect(positions.get(1)).toEqual({ x: 60 + GAP_X, y: 0 });
  });

  it('every scoped node gets a position, no gaps in the returned map', () => {
    // depths [0,1,1,2]: root -> a(leaf), b -> c(leaf). 'c' is given a shape so it isn't folded
    // into 'b' as a merge candidate (a lone real leaf child with no shape/container folds into
    // its parent and never gets its own render slot — see diagramGenTopology.test.ts's own
    // "merge candidate" tests for the same rule).
    const t = tree([0, 1, 1, 2]);
    const d = dims({ 0: { w: 60, h: 44 }, 1: { w: 60, h: 44 }, 2: { w: 60, h: 44 }, 3: { w: 60, h: 44 } });
    const nodeMeta = meta({ 4: { shape: 'ui' } }); // node id 4 = c
    const positions = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, d, nodeMeta);
    expect(positions.size).toBe(4);
    for (let i = 0; i < 4; i++) expect(positions.has(i)).toBe(true);
  });
});

// Pinned local oracle — literal copy of index.html's current layoutDiagramGenTree algorithm,
// adapted to take `nodes` as an explicit closure variable rather than a true ambient global,
// same approach as diagramGenTopology.test.ts.
function oracleLayout(
  nodes: LayoutNode[],
  scope: { rootIdxs: number[] },
  dimsByIdx: Map<number, LayoutBoxDims>,
  nodeMeta: Map<number, LayoutNodeMetaEntry> | undefined
): Map<number, { x: number; y: number }> {
  const widthByIdx = new Map<number, number>();
  function computeWidth(idx: number): number {
    const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
    const ownW = dimsByIdx.get(idx)!.w;
    if (!kids.length) {
      widthByIdx.set(idx, ownW);
      return ownW;
    }
    if (diagramGenIsSequenceCore(nodes, idx, nodeMeta)) {
      if (diagramGenIsHorizontalCore(nodes, idx, nodeMeta)) {
        let rowW = 0;
        kids.forEach((ci, k) => {
          rowW += computeWidth(ci);
          if (k > 0) rowW += GAP_X;
        });
        const colW = Math.max(ownW, rowW);
        widthByIdx.set(idx, colW);
        return colW;
      }
      const colW = Math.max(ownW, ...kids.map((ci) => computeWidth(ci)));
      widthByIdx.set(idx, colW);
      return colW;
    }
    let sum = 0;
    kids.forEach((ci, k) => {
      sum += computeWidth(ci);
      if (k > 0) sum += GAP_X;
    });
    const w = Math.max(ownW, sum);
    widthByIdx.set(idx, w);
    return w;
  }
  const positions = new Map<number, { x: number; y: number }>();
  function place(idx: number, left: number, y: number): number {
    const w = widthByIdx.get(idx)!;
    const ownDims = dimsByIdx.get(idx)!;
    positions.set(idx, { x: left + w / 2 - ownDims.w / 2, y });
    const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
    if (!kids.length) return y + ownDims.h;
    const headerGap = diagramGenChainHeaderSuppressedCore(nodes, idx, nodeMeta) ? GROUP_TITLE_GAP : GAP_Y;
    const rowY = y + ownDims.h + headerGap;
    if (diagramGenIsSequenceCore(nodes, idx, nodeMeta)) {
      if (diagramGenIsHorizontalCore(nodes, idx, nodeMeta)) {
        const rowW = widthByIdx.get(idx)!;
        const rowMaxOwnH = Math.max(...kids.map((ci) => dimsByIdx.get(ci)!.h));
        let cx = left + w / 2 - rowW / 2;
        let maxBottom = rowY;
        kids.forEach((ci) => {
          const cw = widthByIdx.get(ci)!;
          const ch = dimsByIdx.get(ci)!.h;
          const bottom = place(ci, cx, rowY + (rowMaxOwnH - ch) / 2);
          maxBottom = Math.max(maxBottom, bottom);
          cx += cw + GAP_X;
        });
        return maxBottom;
      }
      let curY = rowY;
      kids.forEach((ci) => {
        const cw = widthByIdx.get(ci)!;
        const bottom = place(ci, left + w / 2 - cw / 2, curY);
        curY = bottom + GAP_Y;
      });
      return curY - GAP_Y;
    }
    let cursor = left;
    let maxBottom = rowY;
    kids.forEach((ci) => {
      const cw = widthByIdx.get(ci)!;
      const bottom = place(ci, cursor, rowY);
      maxBottom = Math.max(maxBottom, bottom);
      cursor += cw + GAP_X;
    });
    return maxBottom;
  }
  if (scope.rootIdxs.length > 1) {
    let cursor = 0;
    scope.rootIdxs.forEach((ri) => {
      const w = computeWidth(ri);
      place(ri, cursor, 0);
      cursor += w + GAP_X;
    });
  } else {
    computeWidth(scope.rootIdxs[0]);
    place(scope.rootIdxs[0], 0, 0);
  }
  return positions;
}

describe('oracle comparison across representative trees', () => {
  it.each([
    {
      depths: [0, 1, 1],
      d: { 0: { w: 60, h: 44 }, 1: { w: 100, h: 44 }, 2: { w: 90, h: 64 } },
      m: {}
    },
    {
      depths: [0, 1, 1, 1],
      d: { 0: { w: 60, h: 44 }, 1: { w: 80, h: 44 }, 2: { w: 80, h: 44 }, 3: { w: 80, h: 44 } },
      m: { 1: { sequence: true } }
    },
    {
      depths: [0, 1, 1],
      d: { 0: { w: 60, h: 44 }, 1: { w: 70, h: 44 }, 2: { w: 70, h: 64 } },
      m: { 1: { sequence: true, direction: 'horizontal' } }
    },
    {
      depths: [0, 1, 2, 2, 1],
      d: {
        0: { w: 60, h: 44 },
        1: { w: 80, h: 44 },
        2: { w: 60, h: 44 },
        3: { w: 60, h: 44 },
        4: { w: 90, h: 44 }
      },
      m: { 1: { container: true }, 2: { sequence: true } }
    }
  ])('matches the oracle for depths=%j meta=%j', ({ depths, d, m }) => {
    const t = tree(depths);
    const dimsMap = dims(d as Record<number, LayoutBoxDims>);
    const nodeMeta = meta(m as Record<number, LayoutNodeMetaEntry>);
    const result = layoutDiagramGenTreeCore(t, { rootIdxs: [0] }, dimsMap, nodeMeta);
    const oracleResult = oracleLayout(t, { rootIdxs: [0] }, dimsMap, nodeMeta);
    expect(result).toEqual(oracleResult);
  });
});
