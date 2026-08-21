/**
 * Pure tree-layout engine from the `diagramGen*` subsystem — the deterministic tree-diagram
 * generator ("Generate rough diagram from outline", see docs/architecture-plan.md for the wider
 * feature, `diagramGenDims.ts` for box-sizing/color math, `diagramGenTopology.ts` for the
 * render-topology queries this module builds on, `diagramGenNodeMeta.ts` for the
 * classification-proposal layer, and `diagramGenColors.ts` for branch/tag/marker/shape color
 * assignment). Fifth slice: `layoutDiagramGenTree` — bottom-up subtree-width computation, then
 * top-down x/y assignment, using each node's own (label-derived) box dims rather than one fixed
 * size throughout. A chain group's column width is the widest box among the group members, so
 * shorter step boxes still center under the parent rather than each sitting at a different
 * offset. Driven entirely by confirmed `nodeMeta.sequence`/`.direction` — a sequence's
 * width/placement always recurses into each child's own subtree, which works identically whether
 * that child is a bare leaf or has its own further structure, so one code path covers both what
 * used to be "chain group" and "numbered sequence" as separate cases.
 *
 * This is genuinely pure layout math — a `Map<idx, {x,y}>` computed entirely from `scope`,
 * `dimsByIdx` (the caller's already-computed box dimensions per node, from `diagramGenDims.ts`'s
 * own functions), and confirmed `nodeMeta`. No DOM, no canvas measurement, no randomness.
 *
 * `generateDiagramFromOutline` (the Generate-button entry point — picks scope, trims labels,
 * seeds a classification proposal, hands off to the review screen) and `diagramGenFinishGenerate`
 * (the actual XML-emission renderer that calls this layout function once nodeMeta is confirmed)
 * remain deliberately excluded — both are real orchestration (DOM, `diagrams` array mutation, AI
 * calls, XML string assembly), not pure logic, and are a much larger future scoping question of
 * their own.
 *
 * Lives in `src/state/`, matching every other Diagrams-domain slice in this subsystem.
 *
 * `diagramGenRenderChildIdxsCore`/`diagramGenIsSequenceCore`/`diagramGenIsHorizontalCore`/
 * `diagramGenChainHeaderSuppressedCore` (from `diagramGenTopology.ts`, already generated) are
 * referenced as ambient globals via `declare function`, same pattern every other slice in this
 * subsystem uses.
 *
 * `DIAGRAM_GEN_GAP_X`/`DIAGRAM_GEN_GAP_Y`/`DIAGRAM_GEN_GROUP_TITLE_GAP` are index.html's own
 * top-level consts, also read by hand-written code this slice doesn't touch. Duplicated here as
 * private literals, same reasoning as every other duplicated-constant precedent in this
 * subsystem: every generated block shares one script scope with the rest of index.html, so
 * reusing the real names would be a duplicate top-level `const`. This comment is the single
 * place documenting they must stay in sync with index.html's own copies if they ever change.
 *
 * A real collision check (grep against the rest of index.html and every other module) was run
 * for every new identifier here before treating it as safe, same discipline established
 * throughout this subsystem.
 */

declare function diagramGenRenderChildIdxsCore(nodes: LayoutNode[], idx: number, nodeMeta: LayoutNodeMetaMap): number[];
declare function diagramGenIsSequenceCore(nodes: LayoutNode[], idx: number, nodeMeta: LayoutNodeMetaMap): boolean;
declare function diagramGenIsHorizontalCore(nodes: LayoutNode[], idx: number, nodeMeta: LayoutNodeMetaMap): boolean;
declare function diagramGenChainHeaderSuppressedCore(nodes: LayoutNode[], idx: number, nodeMeta: LayoutNodeMetaMap): boolean;

// Duplicated from index.html's own DIAGRAM_GEN_GAP_X/GAP_Y/GROUP_TITLE_GAP — see this file's
// header for why.
const _DIAGRAM_GEN_GAP_X = 30;
const _DIAGRAM_GEN_GAP_Y = 50;
const _DIAGRAM_GEN_GROUP_TITLE_GAP = 22;

export interface LayoutNode {
  id: number;
  depth: number;
}

/** `shape` is never read directly by this module's own logic — only `container`/`sequence`/
 * `direction` are. It's included for structural compatibility with the real nodeMeta shape,
 * since the ambient `diagramGenRenderChildIdxsCore` this module delegates to DOES read `shape`
 * (for merge-candidate/passthrough/edge-label exclusion) — a caller passing the real, full
 * nodeMeta Map needs this type to accept it without a cast. */
export interface LayoutNodeMetaEntry {
  shape?: string | null;
  container?: boolean;
  sequence?: boolean;
  direction?: string;
}

export type LayoutNodeMetaMap = Map<number, LayoutNodeMetaEntry> | null | undefined;

export interface LayoutBoxDims {
  w: number;
  h: number;
}

export interface LayoutScope {
  rootIdxs: number[];
}

export interface LayoutPosition {
  x: number;
  y: number;
}

/** Pure: matches index.html's own `layoutDiagramGenTree` exactly. Bottom-up subtree-width
 * computation, then top-down x/y assignment. See this file's own header for the full algorithm
 * description. */
export function layoutDiagramGenTreeCore(
  nodes: LayoutNode[],
  scope: LayoutScope,
  dimsByIdx: Map<number, LayoutBoxDims>,
  nodeMeta: LayoutNodeMetaMap
): Map<number, LayoutPosition> {
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
          if (k > 0) rowW += _DIAGRAM_GEN_GAP_X;
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
      if (k > 0) sum += _DIAGRAM_GEN_GAP_X;
    });
    const w = Math.max(ownW, sum);
    widthByIdx.set(idx, w);
    return w;
  }

  const positions = new Map<number, LayoutPosition>();

  function place(idx: number, left: number, y: number): number {
    const w = widthByIdx.get(idx)!;
    const ownDims = dimsByIdx.get(idx)!;
    positions.set(idx, { x: left + w / 2 - ownDims.w / 2, y });
    const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
    if (!kids.length) return y + ownDims.h;
    const headerGap = diagramGenChainHeaderSuppressedCore(nodes, idx, nodeMeta)
      ? _DIAGRAM_GEN_GROUP_TITLE_GAP
      : _DIAGRAM_GEN_GAP_Y;
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
          cx += cw + _DIAGRAM_GEN_GAP_X;
        });
        return maxBottom;
      }
      let curY = rowY;
      kids.forEach((ci) => {
        const cw = widthByIdx.get(ci)!;
        const bottom = place(ci, left + w / 2 - cw / 2, curY);
        curY = bottom + _DIAGRAM_GEN_GAP_Y;
      });
      return curY - _DIAGRAM_GEN_GAP_Y;
    }

    let cursor = left;
    let maxBottom = rowY;
    kids.forEach((ci) => {
      const cw = widthByIdx.get(ci)!;
      const bottom = place(ci, cursor, rowY);
      maxBottom = Math.max(maxBottom, bottom);
      cursor += cw + _DIAGRAM_GEN_GAP_X;
    });
    return maxBottom;
  }

  if (scope.rootIdxs.length > 1) {
    let cursor = 0;
    scope.rootIdxs.forEach((ri) => {
      const w = computeWidth(ri);
      place(ri, cursor, 0);
      cursor += w + _DIAGRAM_GEN_GAP_X;
    });
  } else {
    computeWidth(scope.rootIdxs[0]);
    place(scope.rootIdxs[0], 0, 0);
  }

  return positions;
}
