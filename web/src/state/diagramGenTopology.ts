/**
 * Pure topology and confirmed-nodeMeta query layer from the `diagramGen*` subsystem — the
 * deterministic tree-diagram generator ("Generate rough diagram from outline", see
 * docs/architecture-plan.md for the wider feature and `diagramGenDims.ts` for the first slice,
 * pure box-sizing/color math). Second slice: every function here answers "what does this node's
 * position in the render tree actually look like" — its real children (raw and render-filtered),
 * leaf/chain-group/container/sequence status, and edge-label attachment — once nodeMeta has been
 * confirmed via the review screen. The much larger XML-emission/tree-layout/color-assignment/AI-
 * classification remainder is still a genuinely separate, dedicated future scoping session — not
 * attempted here. `diagramGenProposeNodeMeta`/`diagramGenValidateGuideline`/`diagramGenLegend*`
 * (the review-screen proposal/validation/legend layer) are also deliberately excluded: a
 * different concern (classification heuristics and AI-response validation, not render topology)
 * with its own scoping question, not attempted in this pass either.
 *
 * Lives in `src/state/`, not `src/core/`, matching `diagramAnchor.ts`/`diagramDisplayList.ts`:
 * this is Diagrams-domain logic that reads the outline `nodes` array read-only for context, not
 * outline-mutation-domain logic itself (the `core/` modules construct/mutate `nodes`;
 * `diagramGenDims.ts` is the one `core/` exception, and only because it has zero `nodes`
 * coupling at all — see its own header).
 *
 * All 15 functions here take `nodes`/`idx`/`nodeMeta` as explicit parameters rather than reading
 * them as ambient globals, matching `nodeQueries.ts`'s own conversion — the 15 original
 * hand-written versions in index.html read `nodes` (and, for three of them, `getSubtreeEnd`/
 * `getParentIndex`) as true ambient globals. The thin hand-written wrappers spliced back into
 * index.html supply `nodes` explicitly so every existing external call site keeps working with
 * zero call-site changes (only the wrapper bodies themselves needed updating).
 *
 * `getSubtreeEnd`/`getParentIndex` (from `src/core/nodeQueries.ts`, already a generated block)
 * and `stripSemanticMarkers` (from `src/utils/stripSemanticMarkers.ts`, likewise already
 * generated) are referenced as ambient globals via `declare function` below — type-only, fully
 * erased from the compiled output, resolving at runtime to the real already-spliced functions.
 * `diagramGenHardTruncateCore` (from `src/core/diagramGenDims.ts`, this subsystem's own first
 * slice, already generated) is referenced the same way. `getNodePlainText` (a hand-written
 * one-liner in index.html wrapping `stripSemanticMarkers`, NOT itself a generated block) is
 * inlined directly as a private helper instead — same precedent as `nodeSearch.ts` inlining
 * `escapeRegExpLiteral` and `diagramDisplayList.ts` inlining `diagramStatusOf`/`diagramStatusLabel`.
 *
 * `DIAGRAM_GEN_CHAR_BUDGET` is index.html's own top-level const (`2 * Math.floor((MAX_W - PAD) /
 * CHAR_PX)`, currently 66), also read by hand-written code this slice doesn't touch
 * (`diagramGenTrimText`'s AI-shortening path). Duplicated here as a private literal, computed
 * the same way from the same duplicated inputs `diagramGenDims.ts` already uses — same reasoning
 * as that module's own header: every generated block shares one script scope with the rest of
 * index.html, so reusing the real name would be a duplicate top-level `const`. This comment is
 * the single place documenting it must stay in sync with index.html's own copy if it changes.
 *
 * A real collision check (grep against the rest of index.html, not just "the name looks
 * private") was run for every new private/exported identifier here before treating it as safe,
 * same discipline `diagramDisplayList.ts`'s own `DIAGRAM_STATUSES` near-miss established.
 */

declare function getSubtreeEnd(nodes: TopologyNode[], idx: number): number;
declare function getParentIndex(nodes: TopologyNode[], idx: number): number;
declare function stripSemanticMarkers(text: string | null | undefined): string;
declare function diagramGenHardTruncateCore(text: string, budget: number): string;

// index.html's own DIAGRAM_GEN_CHAR_BUDGET = 2 * Math.floor((DIAGRAM_GEN_MAX_W - DIAGRAM_GEN_PAD)
// / DIAGRAM_GEN_CHAR_PX) = 2 * Math.floor((260 - 24) / 7) = 66. Duplicated here as the single
// derived literal this module actually needs, rather than the three separate inputs — those are
// already duplicated once in diagramGenDims.ts, and reusing THOSE names here would itself be a
// duplicate top-level const across two generated blocks sharing one script scope (caught by the
// generator's own collision checker before this fix). This comment is the single place
// documenting the value must stay in sync with index.html's own DIAGRAM_GEN_CHAR_BUDGET.
const _DIAGRAM_GEN_TOPOLOGY_CHAR_BUDGET = 66;

export interface TopologyNode {
  id: number;
  depth: number;
  text?: string;
  tags?: string[];
}

export interface NodeMetaEntry {
  shape?: string | null;
  container?: boolean;
  sequence?: boolean;
  direction?: string;
}

export type NodeMetaMap = Map<number, NodeMetaEntry> | null | undefined;

/** Pure: matches index.html's own `getNodePlainText` exactly — duplicated here rather than
 * referenced via `declare function`, see this file's header for why. */
function nodePlainText(node: TopologyNode): string {
  return stripSemanticMarkers(node.text || '');
}

function metaFor(nodeMeta: NodeMetaMap, node: TopologyNode): NodeMetaEntry | undefined {
  return nodeMeta ? nodeMeta.get(node.id) : undefined;
}

/** Pure: matches index.html's own `diagramGenIsContainer` exactly. */
export function diagramGenIsContainerCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  return !!metaFor(nodeMeta, nodes[idx])?.container;
}

/** Pure: matches index.html's own `diagramGenIsSequence` exactly. */
export function diagramGenIsSequenceCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  return !!metaFor(nodeMeta, nodes[idx])?.sequence;
}

/** Pure: matches index.html's own `diagramGenIsHorizontal` exactly. */
export function diagramGenIsHorizontalCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  return metaFor(nodeMeta, nodes[idx])?.direction === 'horizontal';
}

/** Pure: matches index.html's own `diagramGenAllChildIdxs` exactly — every direct child one
 * depth level down, within `idx`'s own subtree, with no filtering. */
export function diagramGenAllChildIdxsCore(nodes: TopologyNode[], idx: number): number[] {
  const node = nodes[idx];
  const end = getSubtreeEnd(nodes, idx);
  const out: number[] = [];
  for (let i = idx + 1; i < end; i++) {
    if (nodes[i].depth === node.depth + 1) out.push(i);
  }
  return out;
}

/** Pure: matches index.html's own `diagramGenHasEdgeLabelTag` exactly — legacy #edge-label/
 * #edgelabel tag check, used only as a one-time hint when proposing a node's initial
 * classification. */
export function diagramGenHasEdgeLabelTagCore(nodes: TopologyNode[], idx: number): boolean {
  const node = nodes[idx];
  return Array.isArray(node.tags) && node.tags.some((t) => {
    const s = String(t || '').toLowerCase();
    return s === 'edge-label' || s === 'edgelabel';
  });
}

/** Pure: matches index.html's own `diagramGenChildIdxs` exactly — a plain alias for
 * `diagramGenAllChildIdxsCore`, kept as its own name since most callers read more clearly as
 * "this node's children" than "all child idxs". */
export function diagramGenChildIdxsCore(nodes: TopologyNode[], idx: number): number[] {
  return diagramGenAllChildIdxsCore(nodes, idx);
}

/** Pure: matches index.html's own `diagramGenIsLeaf` exactly. */
export function diagramGenIsLeafCore(nodes: TopologyNode[], idx: number): boolean {
  return diagramGenChildIdxsCore(nodes, idx).length === 0;
}

/** Pure: matches index.html's own `diagramGenIsChainGroup` exactly — more than one child, and
 * every one of them is a leaf. */
export function diagramGenIsChainGroupCore(nodes: TopologyNode[], idx: number): boolean {
  const kids = diagramGenChildIdxsCore(nodes, idx);
  return kids.length > 1 && kids.every((ci) => diagramGenIsLeafCore(nodes, ci));
}

/** Pure: matches index.html's own `diagramGenChainHeaderSuppressed` exactly — a plain alias for
 * `diagramGenIsContainerCore`. */
export function diagramGenChainHeaderSuppressedCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  return diagramGenIsContainerCore(nodes, idx, nodeMeta);
}

/** Pure: matches index.html's own `diagramGenIsConfirmedEdgeLabel` exactly — whether `idx` is
 * confirmed (nodeMeta.shape === 'edge-label') to contribute its text as an edge label rather
 * than rendering as a box of its own, and only actually treated that way if a real
 * (non-edge-label) sibling follows it. */
export function diagramGenIsConfirmedEdgeLabelCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  const meta = metaFor(nodeMeta, nodes[idx]);
  if (!meta || meta.shape !== 'edge-label') return false;
  const parentIdx = getParentIndex(nodes, idx);
  if (parentIdx < 0) return false;
  const siblings = diagramGenAllChildIdxsCore(nodes, parentIdx);
  const pos = siblings.indexOf(idx);
  return siblings.slice(pos + 1).some((si) => {
    const sm = nodeMeta!.get(nodes[si].id);
    return !(sm && sm.shape === 'edge-label');
  });
}

/** Pure: matches index.html's own `diagramGenIsPassthrough` exactly — whether `idx` is confirmed
 * (nodeMeta.shape === 'passthrough') to be a purely organizational wrapper. */
export function diagramGenIsPassthroughCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  const meta = metaFor(nodeMeta, nodes[idx]);
  return !!(meta && meta.shape === 'passthrough');
}

/** Pure: matches index.html's own `diagramGenIsMergeCandidate` exactly — whether `idx` should
 * fold into its parent's own box as a second line of text instead of getting a separate
 * connected box. */
export function diagramGenIsMergeCandidateCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): boolean {
  const meta = metaFor(nodeMeta, nodes[idx]);
  if (meta && (meta.shape || meta.container)) return false;
  if (diagramGenAllChildIdxsCore(nodes, idx).length > 0) return false;
  const parentIdx = getParentIndex(nodes, idx);
  if (parentIdx < 0) return false;
  if (
    diagramGenIsContainerCore(nodes, parentIdx, nodeMeta) ||
    diagramGenIsPassthroughCore(nodes, parentIdx, nodeMeta) ||
    diagramGenIsConfirmedEdgeLabelCore(nodes, parentIdx, nodeMeta)
  ) {
    return false;
  }
  const realSiblings = diagramGenAllChildIdxsCore(nodes, parentIdx).filter(
    (si) => !diagramGenIsConfirmedEdgeLabelCore(nodes, si, nodeMeta)
  );
  return realSiblings.length === 1 && realSiblings[0] === idx;
}

/** Pure: matches index.html's own `diagramGenRenderChildIdxs` exactly — the single source of
 * truth for what a node's box actually connects to once nodeMeta is confirmed. Recursively
 * splices through a passthrough child and drops any confirmed edge-label or merge-candidate
 * child. */
export function diagramGenRenderChildIdxsCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): number[] {
  const out: number[] = [];
  diagramGenAllChildIdxsCore(nodes, idx).forEach((ci) => {
    if (diagramGenIsConfirmedEdgeLabelCore(nodes, ci, nodeMeta)) return;
    if (diagramGenIsMergeCandidateCore(nodes, ci, nodeMeta)) return;
    if (diagramGenIsPassthroughCore(nodes, ci, nodeMeta)) {
      out.push(...diagramGenRenderChildIdxsCore(nodes, ci, nodeMeta));
      return;
    }
    out.push(ci);
  });
  return out;
}

/** Pure: matches index.html's own `diagramGenChainTailIdx` exactly — the terminal node of a
 * sequence, recursing through nested sequences. */
export function diagramGenChainTailIdxCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): number {
  const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
  if (!kids.length) return idx;
  if (!diagramGenIsSequenceCore(nodes, idx, nodeMeta)) return idx;
  return diagramGenChainTailIdxCore(nodes, kids[kids.length - 1], nodeMeta);
}

/** Pure: matches index.html's own `diagramGenEdgeLabelBefore` exactly — maps a real rendered
 * child idx to the (truncated) text of the edge-label node that sat directly before it among
 * `idx`'s true (unfiltered) children. */
export function diagramGenEdgeLabelBeforeCore(nodes: TopologyNode[], idx: number, nodeMeta: NodeMetaMap): Map<number, string> {
  const map = new Map<number, string>();
  let pending: string | null = null;
  diagramGenAllChildIdxsCore(nodes, idx).forEach((ci) => {
    if (diagramGenIsConfirmedEdgeLabelCore(nodes, ci, nodeMeta)) {
      const text = nodePlainText(nodes[ci]).trim();
      pending = text ? diagramGenHardTruncateCore(text, _DIAGRAM_GEN_TOPOLOGY_CHAR_BUDGET) : null;
      return;
    }
    if (diagramGenIsMergeCandidateCore(nodes, ci, nodeMeta) || diagramGenIsPassthroughCore(nodes, ci, nodeMeta)) return;
    if (pending) {
      map.set(ci, pending);
      pending = null;
    }
  });
  return map;
}
