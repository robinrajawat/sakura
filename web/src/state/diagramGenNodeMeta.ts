import { diagramGenChildIdxsCore, diagramGenHasEdgeLabelTagCore, diagramGenIsChainGroupCore } from './diagramGenTopology';

/**
 * Pure nodeMeta classification-proposal and plain-object (de)serialization layer from the
 * `diagramGen*` subsystem — the deterministic tree-diagram generator ("Generate rough diagram
 * from outline", see docs/architecture-plan.md for the wider feature, `diagramGenDims.ts` for
 * the first slice's box-sizing/color math, and `diagramGenTopology.ts` for the second slice's
 * render-topology queries). Third slice: `diagramGenProposeNodeMeta` seeds the review screen's
 * first classification pass for nodes without existing (previously-confirmed) nodeMeta — a
 * structural default (sequence+container) for a flat run of 2+ leaf children, plus a shape guess
 * from a legacy `#edge-label` tag or a `DIAGRAM_GEN_TAG_SHAPE_MAP` keyword match. Nothing here
 * is ever applied silently at render time — `diagramGenTopology.ts`'s functions read only
 * confirmed nodeMeta, once a person has reviewed and accepted or edited the proposal.
 * `diagramGenNodeMetaFromPlain`/`ToPlain` are the plain Map<->JSON-object bridge used when
 * persisting/loading a diagram's confirmed nodeMeta. `diagramGenValidateGuideline`/
 * `diagramGenLegend*` (AI-response validation and legend-XML generation) are deliberately
 * excluded — different concerns, not attempted in this pass either.
 *
 * Lives in `src/state/`, matching `diagramAnchor.ts`/`diagramDisplayList.ts`/
 * `diagramGenTopology.ts`: Diagrams-domain logic reading the outline `nodes` array read-only for
 * context, not outline-mutation-domain logic itself.
 *
 * `diagramGenChildIdxsCore`/`diagramGenIsChainGroupCore`/`diagramGenHasEdgeLabelTagCore` (from
 * `diagramGenTopology.ts`, this subsystem's own second slice, already a generated block) are
 * referenced as ambient globals via `declare function` — type-only, fully erased from the
 * compiled output, resolving at runtime to the real already-spliced functions, same pattern
 * every other slice in this subsystem uses.
 *
 * `DIAGRAM_GEN_TAG_SHAPE_MAP` is index.html's own top-level const, used only by
 * `diagramGenProposeNodeMeta` (verified via a real grep — no other reader exists). Duplicated
 * here as a private literal rather than left as an ambient reference, same reasoning as every
 * other duplicated-constant precedent in this subsystem: every generated block shares one script
 * scope with the rest of index.html, so reusing the real name would be a duplicate top-level
 * `const`. This comment is the single place documenting it must stay in sync with index.html's
 * own copy if it ever changes.
 *
 * A real collision check (grep against the rest of index.html and every other module) was run
 * for every new identifier here before treating it as safe, same discipline established after
 * `diagramDisplayList.ts`'s `DIAGRAM_STATUSES` near-miss and `diagramGenTopology.ts`'s own
 * cross-module collision with `diagramGenDims.ts`.
 */


// Duplicated from index.html's own DIAGRAM_GEN_TAG_SHAPE_MAP — see this file's header for why.
const _DIAGRAM_GEN_TAG_SHAPE_MAP: Record<string, string> = {
  decision: 'decision', decisions: 'decision',
  database: 'datastore', datastore: 'datastore', 'data-store': 'datastore', db: 'datastore',
  excluded: 'excluded', 'out-of-scope': 'excluded', outofscope: 'excluded',
  ui: 'ui', frontend: 'ui', 'front-end': 'ui',
  service: 'service', api: 'service',
  middleware: 'middleware', integration: 'middleware',
  backend: 'backend', 'back-end': 'backend',
  external: 'external', thirdparty: 'external', '3rdparty': 'external', 'third-party': 'external',
  actor: 'actor', persona: 'actor',
  note: 'note', caveat: 'note'
};

export interface NodeMetaSourceNode {
  id: number;
  depth: number;
  tags?: string[];
}

export interface ProposedNodeMetaEntry {
  shape: string | null;
  container: boolean;
  sequence: boolean;
  direction: string;
}

export type ExistingNodeMetaMap = Map<number, ProposedNodeMetaEntry> | null | undefined;

/** Pure: matches index.html's own `diagramGenProposeNodeMeta` exactly. For each idx in
 * `scopeIdxs`: reuses a shallow copy of any existing (previously-confirmed) nodeMeta entry
 * unchanged; otherwise proposes shape from a legacy `#edge-label` tag (highest priority) or a
 * `DIAGRAM_GEN_TAG_SHAPE_MAP` keyword match (a claimed 'decision' with fewer than 2 children is
 * rejected, same guard AI validation uses), and proposes sequence+container (pre-checked) for a
 * flat run of 2+ leaf children (a "chain group") unless a shape was already assigned. */
export function diagramGenProposeNodeMetaCore(
  nodes: NodeMetaSourceNode[],
  scopeIdxs: number[],
  existingMeta: ExistingNodeMetaMap
): Map<number, ProposedNodeMetaEntry> {
  const out = new Map<number, ProposedNodeMetaEntry>();
  scopeIdxs.forEach((idx) => {
    const node = nodes[idx];
    const prev = existingMeta && existingMeta.get(node.id);
    if (prev) {
      out.set(node.id, { ...prev });
      return;
    }
    const kids = diagramGenChildIdxsCore(nodes, idx);
    const leafChain = diagramGenIsChainGroupCore(nodes, idx);
    let shape: string | null = null;
    if (diagramGenHasEdgeLabelTagCore(nodes, idx)) {
      shape = 'edge-label';
    } else if (Array.isArray(node.tags)) {
      for (const tag of node.tags) {
        const mapped = _DIAGRAM_GEN_TAG_SHAPE_MAP[String(tag || '').toLowerCase()];
        if (mapped) {
          shape = mapped;
          break;
        }
      }
      if (shape === 'decision' && kids.length < 2) shape = null;
    }
    const suppressed = shape === 'edge-label';
    out.set(node.id, {
      shape: shape && !leafChain ? shape : shape || null,
      container: leafChain && !shape,
      sequence: leafChain && !suppressed,
      direction: 'vertical'
    });
  });
  return out;
}

/** Pure: matches index.html's own `diagramGenNodeMetaFromPlain` exactly — converts a plain JSON
 * object (keyed by stringified node id) back into a `Map<number, entry>`, skipping any key that
 * doesn't parse as a finite number. */
export function diagramGenNodeMetaFromPlainCore(obj: Record<string, unknown> | null | undefined): Map<number, unknown> {
  const m = new Map<number, unknown>();
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach((k) => {
      const id = Number(k);
      if (Number.isFinite(id)) m.set(id, obj[k]);
    });
  }
  return m;
}

/** Pure: matches index.html's own `diagramGenNodeMetaToPlain` exactly — converts a
 * `Map<number, entry>` into a plain JSON-serializable object keyed by node id. */
export function diagramGenNodeMetaToPlainCore(map: Map<number, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (map) map.forEach((v, k) => { out[k] = v; });
  return out;
}
