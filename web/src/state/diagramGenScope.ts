import { getIndex, getSubtreeEnd } from '../core/nodeQueries';
import { getNodePlainText } from '../utils/stripSemanticMarkers';
import { diagramGenHardTruncateCore } from '../core/diagramGenDims';
import { diagramGenFinishGenerateXmlCore, type FGNode, type FGScope } from './diagramGenFinishGenerate';

/**
 * Phase 6.3 item 11 (docs/phase6-full-parity-plan.md), "Generate-from-outline" half of Diagrams.
 * Wires the already-ported, already-tested `diagramGen*.ts` core logic (Phase 1) into a real
 * entry point for the first time -- direct port of legacy's own `pickDiagramGenScope`
 * (legacy/index.html:23240-23274) and the scope-picking/label-trimming half of
 * `generateDiagramFromOutline` (legacy/index.html:23885-23911), reshaped as pure functions
 * (no toasts, no DOM, no `diagrams` array mutation -- callers render `error` themselves and own
 * adding the result to whatever list they keep).
 *
 * Deliberately NOT ported here, matching this project's "no AI yet" state (§6.9 not started):
 * `diagramGenTrimText`'s AI-shortening call (legacy asks an AI provider to shorten overlong
 * labels before falling back to a plain truncate) -- this always plain-truncates, which IS
 * legacy's own documented fallback behavior for "no key / locked vault / failed response", not a
 * degraded imitation of it. Likewise `nodeMeta` is always `null` here (no AI classification
 * proposal, no review screen) -- `diagramGenFinishGenerateXmlCore` already handles a null
 * `nodeMeta` as its own "plain tree mode" fallback, so this produces exactly what legacy shows
 * before a person ever opens the review screen. Also not ported: `genKey`-based
 * regenerate-in-place (legacy tracks which diagram came from which scope so a second Generate on
 * the same node offers to overwrite it) -- a real, separately-scoped follow-up; every call here
 * is treated as a fresh generation.
 */

// Matches legacy's own DIAGRAM_GEN_MAX_NODES/DIAGRAM_GEN_MAX_DEPTH exactly (legacy/index.html:
// 22492-22493).
export const DIAGRAM_GEN_MAX_NODES = 60;
export const DIAGRAM_GEN_MAX_DEPTH = 10; // levels, root counted as depth 0

// Matches legacy's own computed DIAGRAM_GEN_CHAR_BUDGET exactly: 2*Math.floor((MAX_W-PAD)/CHAR_PX)
// = 2*Math.floor((260-24)/7) = 66 (legacy/index.html:22508). The generic (non-AI) label trim
// before any shape-specific pass (e.g. decision nodes' own tighter 42-char budget, already
// applied inside diagramGenFinishGenerateXmlCore).
export const DIAGRAM_GEN_LABEL_CHAR_BUDGET = 66;

export interface ScopeQueryNode {
  id: number;
  depth: number;
}

export type DiagramGenScopeResult =
  | { ok: true; scope: FGScope }
  | { ok: false; error: string };

/** Pure: matches legacy's own `pickDiagramGenScope` exactly (legacy/index.html:23240-23274),
 * minus the `genKey` computation (see this file's header). `selectedIds` mirrors legacy's own
 * `getSelectedIds()` -- empty means "whole document" (every depth-0 node is a root), exactly one
 * means "that node's subtree", more than one is rejected the same way legacy rejects it. */
export function pickDiagramGenScopeCore(nodes: ScopeQueryNode[], selectedIds: number[]): DiagramGenScopeResult {
  if (!nodes.length) return { ok: false, error: 'Nothing to diagram — this document is empty' };

  let rootIdxs: number[];
  if (selectedIds.length === 0) {
    rootIdxs = nodes.map((_, i) => i).filter((i) => nodes[i].depth === 0);
  } else if (selectedIds.length === 1) {
    const idx = getIndex(nodes, selectedIds[0]);
    if (idx < 0) return { ok: false, error: 'Selected node not found' };
    rootIdxs = [idx];
  } else {
    return { ok: false, error: 'Select a single node to diagram just that section, or nothing to diagram the whole document' };
  }

  const baseDepth = nodes[rootIdxs[0]].depth;
  const scopeIdxSet = new Set<number>();
  rootIdxs.forEach((ri) => {
    const end = getSubtreeEnd(nodes, ri);
    for (let i = ri; i < end; i++) scopeIdxSet.add(i);
  });
  const scopeIdxs = [...scopeIdxSet].sort((a, b) => a - b);
  const maxDepth = Math.max(...scopeIdxs.map((i) => nodes[i].depth)) - baseDepth;

  if (scopeIdxs.length > DIAGRAM_GEN_MAX_NODES) {
    return {
      ok: false,
      error: `Too much to diagram at once (${scopeIdxs.length} nodes, max ${DIAGRAM_GEN_MAX_NODES}) — select a smaller section first`
    };
  }
  if (maxDepth >= DIAGRAM_GEN_MAX_DEPTH) {
    return {
      ok: false,
      error: `Too many levels deep to diagram at once (${maxDepth + 1} levels, max ${DIAGRAM_GEN_MAX_DEPTH}) — select a smaller section first`
    };
  }

  return { ok: true, scope: { rootIdxs, scopeIdxs } };
}

export interface GenerateNode extends ScopeQueryNode {
  text?: string | null;
  tags?: string[];
}

export type GenerateDiagramResult = { ok: true; xml: string } | { ok: false; error: string };

/** Pure (given `now`): matches the scope-picking + label-trimming half of legacy's own
 * `generateDiagramFromOutline` (legacy/index.html:23885-23911), then hands off to the already-
 * generated `diagramGenFinishGenerateXmlCore` for the actual XML assembly -- always in "plain
 * tree mode" (`nodeMeta` null), per this file's header. `nodes` doubles as both the scope-picker
 * input and `FGNode[]` for the XML core; `GenerateNode` is the union of what both need. */
export function generateDiagramXmlFromOutline(
  nodes: GenerateNode[],
  selectedIds: number[],
  now: number = Date.now()
): GenerateDiagramResult {
  const picked = pickDiagramGenScopeCore(nodes, selectedIds);
  if (!picked.ok) return picked;

  const labels = new Map<number, string>();
  picked.scope.scopeIdxs.forEach((idx) => {
    const plain = getNodePlainText(nodes[idx]);
    labels.set(idx, diagramGenHardTruncateCore(plain, DIAGRAM_GEN_LABEL_CHAR_BUDGET));
  });

  const fgNodes: FGNode[] = nodes.map((n) => ({ id: n.id, depth: n.depth, text: n.text ?? undefined, tags: n.tags }));
  const xml = diagramGenFinishGenerateXmlCore(fgNodes, picked.scope, labels, null, now);
  return { ok: true, xml };
}
