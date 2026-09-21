/**
 * Pure final-rect computation from the `diagramGen*` subsystem — the deterministic tree-diagram
 * generator ("Generate rough diagram from outline", see docs/architecture-plan.md for the wider
 * feature and `diagramGenLayout.ts` for the tree-layout engine this module consumes the output
 * of). Sixth slice: `computeDiagramGenFinalRects` — given the raw x/y `positions` from
 * `layoutDiagramGenTreeCore` and each node's box `dimsByIdx`, computes the final rendered
 * `{x, y, w, h}` rect for every node, snapped to a 10px grid in a center-preserving way (the box
 * center rounds to the nearest 10px, not its top-left corner, so a box's midpoint stays close to
 * its unsnapped layout position even as its edges land on round numbers) and shifted so the
 * whole diagram's leftmost edge sits at a fixed 40px margin. Computed once, consumed both by each
 * node's own box AND by any container built around a group of nodes (see
 * `diagramGenFinishGenerate`'s own comment on this) — the two need to agree exactly on where a
 * node actually sits.
 *
 * Also returns `minX`/`maxX`/`maxY`/`offsetX` — the same bounds pass computes them alongside
 * `finalRect`, and the caller (`diagramGenFinishGenerate`) needs `maxX`/`maxY` later for the
 * legend's own x position and the generated XML's overall page width/height, and `minX`/
 * `offsetX` are needed nowhere else once `finalRect` exists but are returned anyway since they
 * were part of the same original pass and cost nothing extra to expose.
 *
 * Genuinely pure math with zero dependencies on any other `diagramGen*` function or constant —
 * no `declare function` ambient references needed at all, the only slice in this subsystem where
 * that's true. Takes `positions`/`dimsByIdx` as plain arguments rather than reading anything
 * ambient.
 *
 * The much larger XML-cell-string-assembly pass this feeds into (`diagramGenFinishGenerate`
 * itself, plus `mergedChildOf`/`dimsByIdx` computation immediately before this in the original
 * function) remains deliberately excluded — real orchestration and string-template construction,
 * not pure logic, and correspondingly a separate future scoping question.
 *
 * Lives in `src/state/`, matching every other Diagrams-domain slice in this subsystem.
 */

export interface FinalRectPosition {
  x: number;
  y: number;
}

export interface FinalRectDims {
  w: number;
  h: number;
}

export interface FinalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramGenBoundsResult {
  finalRect: Map<number, FinalRect>;
  minX: number;
  maxX: number;
  maxY: number;
  offsetX: number;
}

/** Pure: matches index.html's own `diagramGenFinishGenerate` fragment exactly (the `minX`/
 * `maxX`/`maxY`/`snap10`/`offsetX`/`finalRect` computation, before any XML cell string is
 * built). Skips a `scopeIdx` with no position or dims entry rather than throwing — matches the
 * original's own "last-resort safety net" comment: a genuinely position-less node degrades to
 * being missing from the diagram, not a thrown error that kills the whole generation. */
export function computeDiagramGenFinalRectsCore(
  scopeIdxs: number[],
  positions: Map<number, FinalRectPosition>,
  dimsByIdx: Map<number, FinalRectDims>
): DiagramGenBoundsResult {
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  scopeIdxs.forEach((idx) => {
    const p = positions.get(idx);
    const d = dimsByIdx.get(idx);
    if (!p || !d) return;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + d.w);
    maxY = Math.max(maxY, p.y + d.h);
  });

  const snap10 = (n: number) => Math.round(n / 10) * 10;
  const offsetX = 40 - minX;

  const finalRect = new Map<number, FinalRect>();
  scopeIdxs.forEach((idx) => {
    const p = positions.get(idx);
    const d = dimsByIdx.get(idx);
    if (!p || !d) return;
    const w = Math.round(d.w);
    const h = Math.round(d.h);
    const x = snap10(p.x + offsetX + d.w / 2) - Math.round(w / 2);
    const y = snap10(p.y + 40);
    finalRect.set(idx, { x, y, w, h });
  });

  return { finalRect, minX, maxX, maxY, offsetX };
}
