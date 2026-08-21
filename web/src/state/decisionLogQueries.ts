import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

/**
 * Pure lookup/anchor-label/status-query layer for the Decision Log domain — second slice (see
 * `decisionLog.ts` for the first, `normalizeDecisionLog`). `findDecisionLog`/`decisionLogForNode`
 * are pure lookups over the top-level `decisionLogs` array; `decisionLogForNode` additionally
 * enforces the app's one-decision-log-per-node rule (used both by the anchor picker and by
 * `createDecisionLog`'s "reuse the selected node if it's free" shortcut, so every path that
 * assigns an anchor goes through the same check rather than each re-implementing it slightly
 * differently). `decisionStatusLabel`/`decisionStatusOf` are trivial status helpers —
 * capitalize-or-default, and whitelist-or-default respectively. `decisionLogAnchorLabel` is the
 * human-readable "anchored under..." label, near-identical in shape to `diagramAnchor.ts`'s
 * already-extracted `computeDiagramAnchorLabel` (same three-way branch: never linked /
 * linked-but-node-deleted / linked-with-text, same 60-character truncation).
 *
 * `decisionRowSnippet` remains deliberately excluded — the original doc-level caveat bundled it
 * with `getDecisionAnchorCandidates` as "both call the DOM-dependent `stripHtmlToText`," but
 * investigation for this (third) slice found that's only true of `decisionRowSnippet` itself.
 * `decisionRowSnippet` is 4 trivial lines with zero orchestration/branching complexity — not
 * worth injecting `stripHtmlToText` as a dependency (the DI pattern `templatesApply.ts`
 * established) for a function this small. Stays hand-written.
 *
 * `getDecisionAnchorCandidates`, by contrast, has no DOM dependency once traced: it calls
 * `stripSemanticMarkers` (already ambient, see below) and `decisionLogForNode`, whose real logic
 * is `decisionLogForNodeCore` — already generated in THIS file, so referenced directly rather
 * than via `declare function` (that pattern is reserved for functions generated in a *different*
 * file/block; same-file generated functions are just ordinary in-scope calls). Reads `nodes`/
 * `decisionLogs` read-only, single real call site (the anchor-picker popover), already
 * contiguous with this file's existing exports — no pure-code-motion commit needed.
 *
 * `stripSemanticMarkers` (from `src/utils/stripSemanticMarkers.ts`, already a generated block)
 * is referenced as an ambient global via `declare function`, same pattern `diagramAnchor.ts`
 * uses for the identical purpose.
 *
 * `DECISION_STATUSES` is index.html's own top-level const, also read by several other
 * hand-written call sites this slice doesn't touch (each inlining the same whitelist check
 * `decisionStatusOf` already centralizes — a pre-existing inconsistency in the original code,
 * not something this extraction changes). Duplicated here as a private literal, same reasoning
 * as every other duplicated-constant precedent in this migration.
 *
 * Lives in `src/state/`, matching `diagramAnchor.ts`'s own placement reasoning: reads its own
 * domain's data (`decisionLogs`) and the outline `nodes` array read-only for context, never
 * touches `nodes` as a mutation target.
 */


// Duplicated from index.html's own DECISION_STATUSES — see this file's header for why. Named
// distinctly from decisionLog.ts's own private copy of the same array (both are generated
// blocks sharing one top-level script scope, so reusing that name here would be a duplicate
// top-level const — caught via a real grep against every other module before this file was
// wired into the generator, same discipline established after diagramGenTopology.ts's own
// cross-module collision with diagramGenDims.ts).
const _DECISION_STATUSES_QUERIES = ['proposed', 'approved', 'rejected'];

export interface DecisionLogRecord {
  id: string | number;
  anchorNodeId?: number | null;
  status?: string;
}

export interface AnchorableNode {
  id: number;
  text?: string;
  depth?: number;
}

export interface DecisionAnchorCandidate {
  id: number;
  text: string;
  taken: boolean;
  depth: number;
}

/** Pure: matches index.html's own `findDecisionLog` exactly. */
export function findDecisionLogCore(
  decisionLogs: DecisionLogRecord[],
  id: DecisionLogRecord['id']
): DecisionLogRecord | undefined {
  return decisionLogs.find((dl) => dl.id === id);
}

/** Pure: matches index.html's own `decisionLogForNode` exactly — enforces the one-decision-log-
 * per-node rule. Returns `null` for a `nodeId` of `null`/`undefined`, otherwise the decision log
 * (if any) anchored to that node, excluding one whose own id matches `excludeId` (so a log being
 * edited/reassigned doesn't count as already occupying its own current anchor). */
export function decisionLogForNodeCore(
  decisionLogs: DecisionLogRecord[],
  nodeId: number | null | undefined,
  excludeId?: DecisionLogRecord['id']
): DecisionLogRecord | null {
  if (nodeId == null) return null;
  return decisionLogs.find((dl) => dl.anchorNodeId === nodeId && dl.id !== excludeId) || null;
}

/** Pure: matches index.html's own `decisionStatusLabel` exactly — capitalizes the given status,
 * or `'Proposed'` for a falsy input. */
export function decisionStatusLabelCore(s: string | null | undefined): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Proposed';
}

/** Pure: matches index.html's own `decisionStatusOf` exactly — the decision log's own status if
 * it's one of the three whitelisted values (case-insensitively), otherwise `'proposed'`. */
export function decisionStatusOfCore(dl: { status?: string | null } | null | undefined): string {
  const raw = String((dl && dl.status) || '').toLowerCase();
  return _DECISION_STATUSES_QUERIES.includes(raw) ? raw : 'proposed';
}

/** Pure: matches index.html's own `decisionLogAnchorLabel` exactly — the human-readable
 * "anchored under..." label, same three-way branch and 60-character truncation as
 * `diagramAnchor.ts`'s `computeDiagramAnchorLabel`. */
export function decisionLogAnchorLabelCore(
  dl: { anchorNodeId?: number | null },
  nodes: AnchorableNode[]
): string {
  if (dl.anchorNodeId == null) return 'Not linked to a node';
  const node = nodes.find((n) => n.id === dl.anchorNodeId);
  if (!node) return 'Linked node no longer exists';
  const text = stripSemanticMarkers(node.text || '').trim();
  return 'Under: ' + (text ? text.slice(0, 60) : '(untitled node)');
}

/** Pure: matches index.html's own `getDecisionAnchorCandidates` exactly — candidate list for the
 * anchor-picker popover, filtered by `query` (case-insensitive substring match against each
 * node's stripped text), each entry flagged `taken` if it already has a decision log (excluding
 * `excludeId`, so a log being reassigned doesn't grey out its own current anchor), sorted
 * depth-first (same stable-sort reasoning as the Diagrams tab's `getDiagramAnchorCandidates`,
 * which this deliberately doesn't touch — see this file's header) and capped at 50 results. */
export function getDecisionAnchorCandidatesCore(
  nodes: AnchorableNode[],
  decisionLogs: DecisionLogRecord[],
  query: string | null | undefined,
  excludeId?: DecisionLogRecord['id']
): DecisionAnchorCandidate[] {
  const q = String(query || '').trim().toLowerCase();
  const list: DecisionAnchorCandidate[] = nodes.map((n) => ({
    id: n.id,
    text: stripSemanticMarkers(n.text || '').trim() || '(untitled node)',
    taken: !!decisionLogForNodeCore(decisionLogs, n.id, excludeId),
    depth: n.depth || 0,
  }));
  const filtered = q ? list.filter((n) => n.text.toLowerCase().includes(q)) : list;
  return filtered.slice().sort((a, b) => a.depth - b.depth).slice(0, 50);
}
