import { getParentIndex, getSubtreeEnd } from '../core/nodeQueries';
import { applyDiagramGenShapeColorOverridesCore, assignDiagramGenColorsCore } from './diagramGenColors';
import { diagramGenAdjustDimsForShapeCore, diagramGenBoxDimsCore, diagramGenHardTruncateCore, diagramGenLightenCore, diagramGenMergedBoxDimsCore } from '../core/diagramGenDims';
import { diagramGenAllChildIdxsCore, diagramGenChainHeaderSuppressedCore, diagramGenChainTailIdxCore, diagramGenEdgeLabelBeforeCore, diagramGenIsConfirmedEdgeLabelCore, diagramGenIsContainerCore, diagramGenIsHorizontalCore, diagramGenIsMergeCandidateCore, diagramGenIsPassthroughCore, diagramGenIsSequenceCore, diagramGenRenderChildIdxsCore } from './diagramGenTopology';
import { layoutDiagramGenTreeCore } from './diagramGenLayout';
import { computeDiagramGenFinalRectsCore } from './diagramGenRects';
import { diagramGenLegendCellsCore, diagramGenLegendEntriesCore } from './diagramGenLegend';

/**
 * diagramGen* subsystem — sixth slice, the XML-cell-string-assembly pass `diagramGenRects.ts`'s
 * own header flagged as "a separate future scoping question" when that slice deliberately
 * excluded it. Everything from `diagramGenFinishGenerate`'s color assignment through the fully
 * assembled draw.io `<mxfile>` XML string turned out genuinely pure once traced — every one of
 * its dependencies is already a generated `*Core` function (from `diagramGenColors.ts`,
 * `diagramGenDims.ts`, `diagramGenTopology.ts`, `diagramGenLayout.ts`, `diagramGenRects.ts`,
 * `diagramGenLegend.ts`, and `nodeQueries.ts`'s `getSubtreeEnd`/`getParentIndex`) — referenced
 * here via `declare function`, each already taking `nodes` as an explicit parameter rather than
 * reading an ambient global, so this module's own `nodes` parameter threads through unchanged.
 *
 * `diagramGenFinishGenerate` itself stays hand-written — the final `if(existing){...}else{...}`
 * block is genuine orchestration (mutating the `diagrams` array, `markDirty`/`scheduleAutoSave`,
 * opening the Pad panel, re-rendering the diagrams list, regenerating a thumbnail, a toast) with
 * no pure logic left in it once this slice's XML-assembly core is factored out. The wrapper
 * becomes a thin pass-through: call this module's `diagramGenFinishGenerateXmlCore` for the
 * `xml` string, `diagramGenNodeMetaToPlain` (already ambient, unaffected) for the saved
 * `nodeMeta`, then do the existing/new-diagram branch by hand exactly as before.
 *
 * `escXmlAttr` is inlined directly (a hand-written one-liner; its every real caller was inside
 * `diagramGenFinishGenerate` itself, so after this slice it has no real caller left anywhere —
 * same reasoning `diagramGenLegend.ts`'s own inlined copy used, this module needs its own
 * because generated blocks don't reference each other's private helpers).
 *
 * `Date.now()` (for the generated `<diagram id="gd-...">` id) is promoted to an optional `now`
 * parameter defaulting to `Date.now()`, matching `formatRelativeTime.ts`'s established
 * injectable-clock pattern — a deterministic override exists for tests, and the one real caller
 * never needs to supply it.
 *
 * Six color/style constants (`DIAGRAM_GEN_DECISION_CHAR_BUDGET`/`DIAGRAM_GEN_GROUP_TITLE_H`/
 * `DIAGRAM_GEN_PALETTE`/`DIAGRAM_GEN_NOTE_COLOR`/`DIAGRAM_GEN_EXCLUDED_COLOR`/
 * `DIAGRAM_GEN_SHAPE_STYLE`) are index.html's own top-level consts, also read by several other
 * hand-written call sites this slice doesn't touch. Duplicated here as private literals with
 * names unique to this module — verified via a real grep against every other module's
 * identifiers before wiring this file into the generator, same discipline every prior
 * `diagramGen*` slice has used.
 */

export interface FGNode {
  id: number;
  depth: number;
  text?: string;
  tags?: string[];
  marker?: string;
}

export interface FGNodeMetaEntry {
  shape?: string | null;
  container?: boolean;
  sequence?: boolean;
  direction?: string;
}

export type FGNodeMetaMap = Map<number, FGNodeMetaEntry> | null | undefined;

export interface FGScope {
  scopeIdxs: number[];
  rootIdxs: number[];
}

interface FGBoxDims {
  w: number;
  h: number;
}

interface FGRect {
  x: number;
  y: number;
  w: number;
  h: number;
}








// Duplicated from index.html's own DIAGRAM_GEN_DECISION_CHAR_BUDGET — see this file's header.
const _DIAGRAM_GEN_DECISION_CHAR_BUDGET_FG = 42;
// Duplicated from index.html's own DIAGRAM_GEN_GROUP_TITLE_H — see this file's header.
const _DIAGRAM_GEN_GROUP_TITLE_H_FG = 32;

// Duplicated from index.html's own DIAGRAM_GEN_PALETTE — see this file's header.
const _DIAGRAM_GEN_PALETTE_FG: Record<string, { fill: string; stroke: string; font: string }> = {
  gray: {
    fill: '#F1EFE8',
    stroke: '#5F5E5A',
    font: '#2C2C2A',
  },
  purple: {
    fill: '#EEEDFE',
    stroke: '#534AB7',
    font: '#3C3489',
  },
  teal: {
    fill: '#E1F5EE',
    stroke: '#0F6E56',
    font: '#085041',
  },
  coral: {
    fill: '#FAECE7',
    stroke: '#993C1D',
    font: '#712B13',
  },
  pink: {
    fill: '#FBEAF0',
    stroke: '#993556',
    font: '#72243E',
  },
  blue: {
    fill: '#E6F1FB',
    stroke: '#185FA5',
    font: '#0C447C',
  },
  green: {
    fill: '#EAF3DE',
    stroke: '#3B6D11',
    font: '#27500A',
  },
  amber: {
    fill: '#FAEEDA',
    stroke: '#854F0B',
    font: '#633806',
  },
  red: {
    fill: '#FCEBEB',
    stroke: '#A32D2D',
    font: '#791F1F',
  },
};

// Duplicated from index.html's own DIAGRAM_GEN_NOTE_COLOR — see this file's header.
const _DIAGRAM_GEN_NOTE_COLOR_FG = {
  fill: '#FBF8EF',
  stroke: '#B8AF8C',
  font: '#5B5540',
};
// Duplicated from index.html's own DIAGRAM_GEN_EXCLUDED_COLOR — see this file's header.
const _DIAGRAM_GEN_EXCLUDED_COLOR_FG = {
  fill: '#F7F7F5',
  stroke: '#C7C4BA',
  font: '#9A978C',
};

// Duplicated from index.html's own DIAGRAM_GEN_SHAPE_STYLE — see this file's header.
const _DIAGRAM_GEN_SHAPE_STYLE_FG: Record<string, string> = {
  decision: 'rhombus;whiteSpace=wrap;html=1;',
  datastore: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;',
  actor: 'shape=umlActor;whiteSpace=wrap;html=1;outlineConnect=0;verticalLabelPosition=bottom;verticalAlign=top;overflow=visible;',
  external: 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;dashed=1;',
  note: 'shape=note;whiteSpace=wrap;html=1;size=14;',
  excluded: 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;dashed=1;dashPattern=1 3;',
};

function escXmlAttrLocalFG(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pure: matches index.html's own `diagramGenFinishGenerate` exactly, up to (not including) the
 * final `existing`-branch persistence/orchestration — returns the fully assembled draw.io
 * `<mxfile>` XML string for `scope`/`labels`/`nodeMeta`. `labels` IS mutated in place (a decision
 * node's label gets hard-truncated to its own, tighter character budget) — matching the
 * original's own behavior exactly, since the caller's `labels` Map is expected to reflect the
 * final rendered text afterward. */
export function diagramGenFinishGenerateXmlCore(
  nodes: FGNode[],
  scope: FGScope,
  labels: Map<number, string>,
  nodeMeta: FGNodeMetaMap,
  now: number = Date.now()
): string {
  const colorByIdx = assignDiagramGenColorsCore(nodes, scope, nodeMeta);
  const anyShapeSet = scope.scopeIdxs.some((idx) => {
    const m = nodeMeta?.get(nodes[idx].id);
    return !!(m && m.shape);
  });
  applyDiagramGenShapeColorOverridesCore(nodes, scope, colorByIdx, nodeMeta, anyShapeSet);

  // A decision node's label can't be sized correctly until its shape is known — a second, local
  // pass on top of the generic trim already done by the caller (generateDiagramFromOutline).
  labels.forEach((text, idx) => {
    const meta = nodeMeta?.get(nodes[idx].id);
    if (meta && meta.shape === 'decision' && text.length > _DIAGRAM_GEN_DECISION_CHAR_BUDGET_FG) {
      labels.set(idx, diagramGenHardTruncateCore(text, _DIAGRAM_GEN_DECISION_CHAR_BUDGET_FG));
    }
  });

  // A merge candidate folds its text into its PARENT's own box as a second line instead of
  // getting a separate connected box — computed once here, keyed by the PARENT's idx, and
  // consulted both when sizing boxes below and when building each box's XML value further down.
  const mergedChildOf = new Map<number, number>();
  scope.scopeIdxs.forEach((idx) => {
    const cand = diagramGenAllChildIdxsCore(nodes, idx).find((ci) => diagramGenIsMergeCandidateCore(nodes, ci, nodeMeta));
    if (cand != null) mergedChildOf.set(idx, cand);
  });

  const dimsByIdx = new Map<number, FGBoxDims>();
  scope.scopeIdxs.forEach((idx) => {
    const meta = nodeMeta?.get(nodes[idx].id);
    const mergedCi = mergedChildOf.get(idx);
    const dims = diagramGenAdjustDimsForShapeCore(
      mergedCi != null
        ? diagramGenMergedBoxDimsCore(labels.get(idx) || '', labels.get(mergedCi) || '')
        : diagramGenBoxDimsCore(labels.get(idx) || ''),
      (meta && meta.shape) || ''
    );
    // A suppressed (container) header never gets its own box, so its "dims" from here on only
    // need to be big enough for a compact title strip on the container's background.
    if (diagramGenChainHeaderSuppressedCore(nodes, idx, nodeMeta)) dims.h = _DIAGRAM_GEN_GROUP_TITLE_H_FG;
    dimsByIdx.set(idx, dims);
  });

  const positions = layoutDiagramGenTreeCore(nodes, { rootIdxs: scope.rootIdxs }, dimsByIdx, nodeMeta);
  // Pass 1: the final rendered rect for every node, using the same center-preserving snap used
  // everywhere else — computed once so both the node's own box AND any container built from it
  // agree exactly on where it actually sits.
  const { finalRect, minX, maxX, maxY, offsetX } = computeDiagramGenFinalRectsCore(scope.scopeIdxs, positions, dimsByIdx);

  let cells = '';
  const chainHeaderSuppressed = (idx: number) => diagramGenChainHeaderSuppressedCore(nodes, idx, nodeMeta);

  // A container's own bounding box, keyed by idx — edgeCell needs this to figure out which side
  // of the container an edge should actually touch, since gd-grp{idx} isn't a real node with its
  // own entry in finalRect the way a normal box is.
  const groupRect = new Map<number, FGRect>();
  scope.scopeIdxs.forEach((idx) => {
    if (!diagramGenIsContainerCore(nodes, idx, nodeMeta)) return;
    const meta = nodeMeta?.get(nodes[idx].id);
    const isNote = meta && meta.shape === 'note';
    const isExcluded = meta && meta.shape === 'excluded';
    const groupBase = isNote
      ? _DIAGRAM_GEN_NOTE_COLOR_FG
      : isExcluded
        ? _DIAGRAM_GEN_EXCLUDED_COLOR_FG
        : _DIAGRAM_GEN_PALETTE_FG[colorByIdx.get(idx) || 'gray'] || _DIAGRAM_GEN_PALETTE_FG.gray;
    const end = getSubtreeEnd(nodes, idx);
    const descendantIdxs = scope.scopeIdxs.filter((i) => i >= idx && i < end);
    const rects = descendantIdxs.map((i) => finalRect.get(i)).filter((r): r is FGRect => !!r);
    if (!rects.length) return;
    // A container that wraps ANOTHER container needs extra breathing room, or the outer card's
    // own edge ends up flush against the inner one with no visible separation between them.
    const hasNestedContainer = descendantIdxs.some((i) => i !== idx && diagramGenIsContainerCore(nodes, i, nodeMeta));
    const pad = hasNestedContainer ? 20 : 12;
    const gx = Math.min(...rects.map((r) => r.x)) - pad;
    const gy = Math.min(...rects.map((r) => r.y)) - pad;
    const gx2 = Math.max(...rects.map((r) => r.x + r.w)) + pad;
    const gy2 = Math.max(...rects.map((r) => r.y + r.h)) + pad;
    groupRect.set(idx, { x: gx, y: gy, w: gx2 - gx, h: gy2 - gy });
    const bodyFill = diagramGenLightenCore(groupBase.fill, 0.55);
    const groupStroke = diagramGenLightenCore(groupBase.stroke, 0.35);
    const titleStyle = `verticalAlign=top;align=center;fontStyle=1;fontSize=13;fontColor=${groupBase.font};spacingTop=12;`;
    const style = `rounded=1;absoluteArcSize=1;arcSize=16;whiteSpace=wrap;html=1;fillColor=${bodyFill};strokeColor=${groupStroke};strokeWidth=1;connectable=0;${titleStyle}`;
    cells += `<mxCell id="gd-grp${idx}" value="${escXmlAttrLocalFG(labels.get(idx))}" style="${style}" vertex="1" parent="1"><mxGeometry x="${gx}" y="${gy}" width="${gx2 - gx}" height="${gy2 - gy}" as="geometry" /></mxCell>\n`;
  });

  // Pass 2: the actual node boxes, on top of any container background from pass 1. A container's
  // own header is skipped here since its text already rendered as the container's own title
  // above.
  scope.scopeIdxs.forEach((idx) => {
    if (chainHeaderSuppressed(idx)) return;
    const rect = finalRect.get(idx);
    if (!rect) return;
    const meta = nodeMeta?.get(nodes[idx].id);
    const isNote = meta && meta.shape === 'note';
    const isExcluded = meta && meta.shape === 'excluded';
    const c = isNote
      ? _DIAGRAM_GEN_NOTE_COLOR_FG
      : isExcluded
        ? _DIAGRAM_GEN_EXCLUDED_COLOR_FG
        : _DIAGRAM_GEN_PALETTE_FG[colorByIdx.get(idx) || 'gray'] || _DIAGRAM_GEN_PALETTE_FG.gray;
    const baseStyle = (meta && _DIAGRAM_GEN_SHAPE_STYLE_FG[meta.shape || '']) || 'rounded=1;absoluteArcSize=1;arcSize=6;whiteSpace=wrap;html=1;';
    const style = `${baseStyle}fillColor=${c.fill};strokeColor=${c.stroke};fontColor=${c.font};fontSize=12;strokeWidth=1.5;`;
    const mergedCi = mergedChildOf.get(idx);
    // A merge candidate's text becomes a second line under the parent's own title.
    const value =
      mergedCi != null
        ? `&lt;b&gt;${escXmlAttrLocalFG(labels.get(idx))}&lt;/b&gt;&lt;br&gt;${escXmlAttrLocalFG(labels.get(mergedCi))}`
        : escXmlAttrLocalFG(labels.get(idx));
    const { x, y, w, h } = rect;
    cells += `<mxCell id="gd-n${idx}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry" /></mxCell>\n`;
  });

  let edgeCounter = 0;
  const drawnPairs = new Set<string>();
  function edgeCell(a: number, b: number, label: string | null, dashed: boolean): string {
    // A container header has no box of its own anymore — an edge into or out of it should touch
    // the tinted container's own boundary rather than reaching inside past that boundary.
    const cellId = (i: number) => (chainHeaderSuppressed(i) ? 'gd-grp' + i : 'gd-n' + i);
    const srcId = cellId(a);
    const tgtId = cellId(b);
    if (srcId === tgtId) return '';
    const key = srcId + '\u2192' + tgtId;
    if (drawnPairs.has(key)) return '';
    drawnPairs.add(key);
    // Horizontal anchors only for the specific case that needs them: two siblings inside the
    // same confirmed horizontal sequence, where they're deliberately placed side by side.
    const pa = getParentIndex(nodes, a);
    const pb = getParentIndex(nodes, b);
    const horizontal = pa >= 0 && pa === pb && diagramGenIsSequenceCore(nodes, pa, nodeMeta) && diagramGenIsHorizontalCore(nodes, pa, nodeMeta);
    let exitAnchor = 'exitX=0.5;exitY=1;';
    let entryAnchor = 'entryX=0.5;entryY=0;';
    if (horizontal) {
      const rectOf = (i: number) => (chainHeaderSuppressed(i) ? groupRect.get(i) : finalRect.get(i));
      const ra = rectOf(a);
      const rb = rectOf(b);
      if (ra && rb) {
        const dx = rb.x + rb.w / 2 - (ra.x + ra.w / 2);
        exitAnchor = dx >= 0 ? 'exitX=1;exitY=0.5;' : 'exitX=0;exitY=0.5;';
        entryAnchor = dx >= 0 ? 'entryX=0;entryY=0.5;' : 'entryX=1;entryY=0.5;';
      }
    }
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;${exitAnchor}exitDx=0;exitDy=0;${entryAnchor}entryDx=0;entryDy=0;` + (dashed ? 'dashed=1;' : '');
    const val = label ? ` value="${escXmlAttrLocalFG(label)}"` : '';
    return `<mxCell id="gd-e${edgeCounter++}"${val} style="${style}" edge="1" parent="1" source="${srcId}" target="${tgtId}"><mxGeometry relative="1" as="geometry" /></mxCell>\n`;
  }

  // An edge into an 'excluded' node is dashed automatically — a plain tree layout still reads as
  // "this path is out of scope" rather than just another equal step in the flow.
  const isExcludedIdx = (ci: number) => {
    const m = nodeMeta?.get(nodes[ci].id);
    return !!(m && m.shape === 'excluded');
  };
  scope.scopeIdxs.forEach((idx) => {
    // A passthrough node or a confirmed edge-label node has no box of its own, so it can never
    // be a valid edge SOURCE here.
    if (diagramGenIsPassthroughCore(nodes, idx, nodeMeta) || diagramGenIsConfirmedEdgeLabelCore(nodes, idx, nodeMeta)) return;
    const kids = diagramGenRenderChildIdxsCore(nodes, idx, nodeMeta);
    if (!kids.length) return;
    // An edge-label node sitting between two of idx's real children supplies the label for the
    // edge arriving at whichever real child came right after it.
    const edgeLabels = diagramGenEdgeLabelBeforeCore(nodes, idx, nodeMeta);
    if (diagramGenIsSequenceCore(nodes, idx, nodeMeta)) {
      // Suppressed (container) header: the container's own boundary already serves as the
      // visual entry point — a further "header → first child" edge here would be redundant.
      if (!chainHeaderSuppressed(idx)) cells += edgeCell(idx, kids[0], edgeLabels.get(kids[0]) || null, isExcludedIdx(kids[0]));
      for (let k = 0; k < kids.length - 1; k++) {
        cells += edgeCell(diagramGenChainTailIdxCore(nodes, kids[k], nodeMeta), kids[k + 1], edgeLabels.get(kids[k + 1]) || null, isExcludedIdx(kids[k + 1]));
      }
    } else {
      kids.forEach((ci) => {
        cells += edgeCell(idx, ci, edgeLabels.get(ci) || null, isExcludedIdx(ci));
      });
    }
  });

  // nodeMeta is nullable throughout this function (every other use above reads it via
  // `nodeMeta?.get(...)`); diagramGenLegendEntriesCore's own real signature requires a
  // non-null map. `?? new Map()` is behaviorally identical to every other `?.get()` call
  // site above (an empty map's `.get()` also returns undefined) — this fallback wasn't
  // needed before because the old `declare function` ambient stub declared its OWN
  // (nullable) parameter type here rather than the real function's, so TypeScript never
  // actually checked this call against diagramGenLegendEntriesCore's true signature. A
  // real cross-module import surfaces this for the first time; the fix preserves the
  // exact existing behavior rather than changing it.
  const legendEntries = diagramGenLegendEntriesCore(nodes, scope, nodeMeta ?? new Map());
  let legendW = 0;
  if (legendEntries.length) {
    cells += diagramGenLegendCellsCore(legendEntries, Math.round(maxX + offsetX + 40), 40);
    legendW = 190;
  }

  return `<mxfile host="app.diagrams.net"><diagram name="Generated from outline" id="gd-${now}"><mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${Math.round(maxX - minX + 80 + legendW)}" pageHeight="${Math.round(maxY + 80)}" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />\n${cells}</root></mxGraphModel></diagram></mxfile>`;
}
