import { diagramGenIsSequenceCore, diagramGenRenderChildIdxsCore } from './diagramGenTopology';

/**
 * Pure color-assignment layer from the `diagramGen*` subsystem — the deterministic tree-diagram
 * generator ("Generate rough diagram from outline", see docs/architecture-plan.md for the wider
 * feature, `diagramGenDims.ts` for the first slice's box-sizing/color math, `diagramGenTopology.ts`
 * for the second slice's render-topology queries, and `diagramGenNodeMeta.ts` for the third
 * slice's classification-proposal layer). Fourth slice, two functions: `assignDiagramGenColors`
 * walks the render tree (via `diagramGenTopology.ts`'s already-generated
 * `diagramGenRenderChildIdxsCore`) assigning a palette key to every node — multi-root docs get a
 * cycled branch color per root; a tag on a node (or inherited from a tagged ancestor) overrides
 * branch color; an explicit node marker outranks both. `diagramGenTagColorKey` (its only caller)
 * hashes a tag string to a deterministic reserved hue, extracted alongside it rather than as a
 * separate ambient reference, since it has no other caller (verified via a real grep).
 * `applyDiagramGenShapeColorOverrides` runs after `assignDiagramGenColors`, overriding its output
 * with AI-classified shape colors once a real shape classification exists anywhere in scope —
 * added to this module (rather than its own) since it's a direct, small companion to
 * `assignDiagramGenColors` sharing the same domain and one of the same duplicated constants
 * (`DIAGRAM_GEN_MARKER_COLOR`).
 *
 * `diagramGenLegend*`/`diagramGenValidateGuideline` (legend-XML generation and AI-response
 * validation, which read several of the same color constants plus several more not needed here)
 * are deliberately excluded — different concerns, not attempted in this pass either.
 *
 * Lives in `src/state/`, matching every other Diagrams-domain slice in this subsystem
 * (Diagrams-domain logic reading the outline `nodes` array read-only for context, not
 * outline-mutation-domain logic itself).
 *
 * `diagramGenRenderChildIdxsCore`/`diagramGenIsSequenceCore` (from `diagramGenTopology.ts`, this
 * subsystem's own second slice, already generated) are referenced as ambient globals via
 * `declare function` — type-only, fully erased from the compiled output, resolving at runtime to
 * the real already-spliced functions, same pattern every other slice in this subsystem uses.
 *
 * `DIAGRAM_GEN_TAG_CYCLE`/`DIAGRAM_GEN_BRANCH_CYCLE`/`DIAGRAM_GEN_MARKER_COLOR`/
 * `DIAGRAM_GEN_SHAPE_COLOR` are index.html's own top-level consts, also read by hand-written code
 * this slice doesn't touch (`diagramGenLegendEntries`, and comments referencing the
 * pigeonhole-collision reasoning behind the 8-hue cycles). Duplicated here as private literals,
 * same reasoning as every other duplicated-constant precedent in this subsystem: every generated
 * block shares one script scope with the rest of index.html, so reusing the real names would be
 * a duplicate top-level `const`. This comment is the single place documenting they must stay in
 * sync with index.html's own copies if they ever change.
 *
 * A real collision check (grep against the rest of index.html and every other module) was run
 * for every new identifier here before treating it as safe, same discipline established after
 * `diagramDisplayList.ts`'s `DIAGRAM_STATUSES` near-miss and `diagramGenTopology.ts`'s own
 * cross-module collision with `diagramGenDims.ts`.
 */


// Duplicated from index.html's own DIAGRAM_GEN_TAG_CYCLE — see this file's header for why.
const _DIAGRAM_GEN_TAG_CYCLE = ['blue', 'green', 'amber', 'red', 'purple', 'teal', 'coral', 'pink'];
// Duplicated from index.html's own DIAGRAM_GEN_BRANCH_CYCLE — see this file's header for why.
const _DIAGRAM_GEN_BRANCH_CYCLE = ['purple', 'teal', 'coral', 'pink', 'blue', 'green', 'amber', 'red'];
// Duplicated from index.html's own DIAGRAM_GEN_MARKER_COLOR — see this file's header for why.
const _DIAGRAM_GEN_MARKER_COLOR: Record<string, string> = { confirmed: 'green', issue: 'red', parked: 'gray', followup: 'amber', na: 'pink' };
// Duplicated from index.html's own DIAGRAM_GEN_SHAPE_COLOR — see this file's header for why.
const _DIAGRAM_GEN_SHAPE_COLOR: Record<string, string> = { ui: 'blue', service: 'teal', middleware: 'purple', backend: 'coral', datastore: 'coral', external: 'gray', actor: 'pink', decision: 'amber' };

export interface ColorAssignNode {
  id: number;
  depth: number;
  tags?: string[];
  marker?: string;
}

export interface ColorAssignNodeMetaEntry {
  shape?: string | null;
  container?: boolean;
  sequence?: boolean;
  direction?: string;
}

export type ColorAssignNodeMetaMap = Map<number, ColorAssignNodeMetaEntry> | null | undefined;

export interface ColorAssignScope {
  rootIdxs: number[];
}

export interface ShapeOverrideScope {
  scopeIdxs: number[];
}

/** Pure: matches index.html's own `diagramGenTagColorKey` exactly — a deterministic per-document
 * hash from tag text to one of 8 reserved hues (no hardcoded keyword dictionary that would only
 * fit one person's vocabulary). */
export function diagramGenTagColorKeyCore(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h + tag.charCodeAt(i)) % _DIAGRAM_GEN_TAG_CYCLE.length;
  return _DIAGRAM_GEN_TAG_CYCLE[h];
}

/** Pure: matches index.html's own `assignDiagramGenColors` exactly. Assigns a palette key to
 * every node in scope: multi-root docs use a virtual root (gray, never drawn) so each top-level
 * item still gets its own branch color. A tag on a node (or an inherited one from a tagged
 * ancestor) overrides branch color; an explicit node marker outranks both, since it's the most
 * deliberate signal of the three. A genuine fan-out below the top level (2+ rendered children
 * that aren't a confirmed sequence) is a real branch point and gets each path its own cycled
 * color the same way the tree's top level does; a confirmed sequence inherits the parent's color
 * unchanged, since those steps are meant to read as one continuous flow. */
export function assignDiagramGenColorsCore(
  nodes: ColorAssignNode[],
  scope: ColorAssignScope,
  nodeMeta: ColorAssignNodeMetaMap
): Map<number, string> {
  const colorByIdx = new Map<number, string>();
  let branchCursor = 0;

  function walk(idx: number, inheritedKey: string): void {
    const node = nodes[idx];
    let key = inheritedKey;
    const tag = Array.isArray(node.tags) && node.tags.length ? node.tags[0] : null;
    if (tag) key = diagramGenTagColorKeyCore(tag);
    const markerKey = node.marker && _DIAGRAM_GEN_MARKER_COLOR[node.marker];
    if (markerKey) key = markerKey;
    colorByIdx.set(idx, key);

    const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
    const isRealBranch = kids.length > 1 && !diagramGenIsSequenceCore(nodes, idx, nodeMeta);
    kids.forEach((ci) => {
      const childKey = isRealBranch
        ? _DIAGRAM_GEN_BRANCH_CYCLE[branchCursor++ % _DIAGRAM_GEN_BRANCH_CYCLE.length]
        : key;
      walk(ci, childKey);
    });
  }

  if (scope.rootIdxs.length > 1) {
    scope.rootIdxs.forEach((ri) => {
      const key = _DIAGRAM_GEN_BRANCH_CYCLE[branchCursor % _DIAGRAM_GEN_BRANCH_CYCLE.length];
      branchCursor++;
      walk(ri, key);
    });
  } else {
    colorByIdx.set(scope.rootIdxs[0], 'gray');
    const rootIdx = scope.rootIdxs[0];
    const topKids = diagramGenRenderChildIdxsCore(nodes, rootIdx, nodeMeta);
    let assignedRoot = false;
    topKids.forEach((ci) => {
      const key = _DIAGRAM_GEN_BRANCH_CYCLE[branchCursor % _DIAGRAM_GEN_BRANCH_CYCLE.length];
      branchCursor++;
      walk(ci, key);
      assignedRoot = true;
    });
    if (!assignedRoot) colorByIdx.set(rootIdx, 'gray');
  }

  return colorByIdx;
}

/** Pure: matches index.html's own `applyDiagramGenShapeColorOverrides` exactly. Runs after
 * `assignDiagramGenColorsCore`, mutating its `colorByIdx` output in place. A no-op unless
 * `nodeMeta` is non-empty AND `anyShapeSet` is true (computed by the caller: does any node in
 * this scope have a real shape?) — once a real, deliberate shape classification exists anywhere
 * in scope, every other color on the page needs to mean something too, so an unclassified node's
 * arbitrary branch-cycle hue falls back to neutral gray instead of reading as an unexplained
 * color next to classified ones. A node with an explicit marker is skipped entirely (marker
 * color already won in `assignDiagramGenColorsCore` and stays outranking shape here too); a
 * classified shape with a known palette color overrides to that color; `'note'`/`'excluded'`
 * shapes get their own bespoke, non-palette color elsewhere and are left untouched; everything
 * else falls back to gray. */
export function applyDiagramGenShapeColorOverridesCore(
  nodes: ColorAssignNode[],
  scope: ShapeOverrideScope,
  colorByIdx: Map<number, string>,
  nodeMeta: ColorAssignNodeMetaMap,
  anyShapeSet: boolean
): void {
  if (!nodeMeta || !nodeMeta.size || !anyShapeSet) return;
  scope.scopeIdxs.forEach((idx) => {
    const node = nodes[idx];
    if (node.marker && _DIAGRAM_GEN_MARKER_COLOR[node.marker]) return;
    const meta = nodeMeta.get(node.id);
    if (meta && meta.shape && _DIAGRAM_GEN_SHAPE_COLOR[meta.shape]) {
      colorByIdx.set(idx, _DIAGRAM_GEN_SHAPE_COLOR[meta.shape]);
      return;
    }
    if (meta && (meta.shape === 'note' || meta.shape === 'excluded')) return;
    colorByIdx.set(idx, 'gray');
  });
}
