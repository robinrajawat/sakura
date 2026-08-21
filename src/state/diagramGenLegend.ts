/**
 * Pure legend-generation layer from the `diagramGen*` subsystem — the deterministic tree-diagram
 * generator ("Generate rough diagram from outline", see docs/architecture-plan.md for the wider
 * feature). `diagramGenLegendEntries` decides which shape/marker legend swatches actually appear
 * — the legend only ever shows what's really on the page, never a static "here are all N possible
 * shapes" block. `diagramGenLegendCells` renders those entries as a column of draw.io `<mxCell>`
 * XML (a small colored square plus a text label per entry).
 *
 * Both turned out to be genuinely pure once traced: `diagramGenLegendEntries` reads `nodes`
 * (promoted to an explicit first parameter, same pattern `diagramGenColors.ts`'s
 * `assignDiagramGenColorsCore`/`applyDiagramGenShapeColorOverridesCore` already established)
 * and `nodeMeta`, no DOM/canvas involved. `diagramGenLegendCells` is plain string templating.
 *
 * `escXmlAttr` — a hand-written one-liner (HTML-entity-escapes `&`/`<`/`>`/`"` for a safe XML
 * attribute value) — has real other callers outside this slice (`diagramGenFinishGenerate`,
 * deliberately not touched here), so it's inlined directly rather than referenced via
 * `declare function`, same reasoning `serializeOpml.ts`'s slice used for `escAttr`.
 *
 * `DIAGRAM_GEN_PALETTE`/`DIAGRAM_GEN_LAYER_ORDER`/`DIAGRAM_GEN_SHAPE_COLOR`/
 * `DIAGRAM_GEN_SHAPE_LABEL`/`DIAGRAM_GEN_NOTE_COLOR`/`DIAGRAM_GEN_EXCLUDED_COLOR`/
 * `DIAGRAM_GEN_MARKER_COLOR`/`DIAGRAM_GEN_MARKER_LABEL` are index.html's own top-level consts,
 * also read by several other hand-written call sites this slice doesn't touch. Duplicated here
 * as private literals with names unique to this module, same reasoning as every other
 * duplicated-constant precedent in this migration — verified via a real grep against every
 * other module's identifiers before wiring this file into the generator, avoiding the kind of
 * collision `diagramGenTopology.ts`'s own header describes.
 */

export interface LegendScope {
  scopeIdxs: number[];
}

export interface LegendNode {
  id: number;
  marker?: string;
}

export interface LegendNodeMetaEntry {
  shape?: string | null;
}

export type LegendNodeMetaMap = Map<number, LegendNodeMetaEntry>;

export interface LegendEntry {
  label: string;
  color: { fill: string; stroke: string; font: string };
}

// Duplicated from index.html's own DIAGRAM_GEN_PALETTE — see this file's header for why.
const _DIAGRAM_GEN_PALETTE_LEGEND: Record<string, { fill: string; stroke: string; font: string }> = {
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

// Duplicated from index.html's own DIAGRAM_GEN_MARKER_COLOR — see this file's header for why.
const _DIAGRAM_GEN_MARKER_COLOR_LEGEND: Record<string, string> = {
  confirmed: 'green',
  issue: 'red',
  parked: 'gray',
  followup: 'amber',
  na: 'pink',
};

// Duplicated from index.html's own DIAGRAM_GEN_LAYER_ORDER — see this file's header for why.
const _DIAGRAM_GEN_LAYER_ORDER_LEGEND: string[] = ['actor', 'ui', 'service', 'middleware', 'backend', 'external'];

// Duplicated from index.html's own DIAGRAM_GEN_SHAPE_COLOR — see this file's header for why.
const _DIAGRAM_GEN_SHAPE_COLOR_LEGEND: Record<string, string> = {
  ui: 'blue',
  service: 'teal',
  middleware: 'purple',
  backend: 'coral',
  datastore: 'coral',
  external: 'gray',
  actor: 'pink',
  decision: 'amber',
};

// Duplicated from index.html's own DIAGRAM_GEN_NOTE_COLOR — see this file's header for why.
const _DIAGRAM_GEN_NOTE_COLOR_LEGEND = {
  fill: '#FBF8EF',
  stroke: '#B8AF8C',
  font: '#5B5540',
};

// Duplicated from index.html's own DIAGRAM_GEN_EXCLUDED_COLOR — see this file's header for why.
const _DIAGRAM_GEN_EXCLUDED_COLOR_LEGEND = {
  fill: '#F7F7F5',
  stroke: '#C7C4BA',
  font: '#9A978C',
};

// Duplicated from index.html's own DIAGRAM_GEN_SHAPE_LABEL — see this file's header for why.
const _DIAGRAM_GEN_SHAPE_LABEL_LEGEND: Record<string, string> = {
  ui: 'UI / Frontend',
  service: 'Service / API',
  middleware: 'Middleware / Integration',
  backend: 'Backend / Persistence',
  datastore: 'Data store',
  external: 'External system',
  actor: 'Actor',
  decision: 'Decision',
  note: 'Note',
  excluded: 'Out of scope / unaffected',
};

// Duplicated from index.html's own DIAGRAM_GEN_MARKER_LABEL — see this file's header for why.
const _DIAGRAM_GEN_MARKER_LABEL_LEGEND: Record<string, string> = {
  confirmed: 'Confirmed',
  issue: 'Issue',
  parked: 'Parked',
  followup: 'Follow-up',
  na: 'N/A',
};

function escXmlAttrLocal(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pure: matches index.html's own `diagramGenLegendEntries` exactly — which shape/marker
 * categories actually appear anywhere in `scope`, in a fixed display order (layer order first,
 * then decision/note/excluded/datastore, then markers in their own fixed order), each with its
 * resolved label and palette color. Only categories genuinely present get an entry — the legend
 * never shows a static "here are all N possible shapes" block. */
export function diagramGenLegendEntriesCore(
  nodes: LegendNode[],
  scope: LegendScope,
  nodeMeta: LegendNodeMetaMap
): LegendEntry[] {
  const shapesUsed = new Set<string>();
  const markersUsed = new Set<string>();
  scope.scopeIdxs.forEach((idx) => {
    const node = nodes[idx];
    const meta = nodeMeta.get(node.id);
    if (meta && meta.shape && meta.shape !== 'process') shapesUsed.add(meta.shape);
    if (node.marker && _DIAGRAM_GEN_MARKER_COLOR_LEGEND[node.marker]) markersUsed.add(node.marker);
  });
  const entries: LegendEntry[] = [];
  _DIAGRAM_GEN_LAYER_ORDER_LEGEND.concat(['decision', 'note', 'excluded', 'datastore']).forEach((k) => {
    if (!shapesUsed.has(k)) return;
    entries.push({
      label: _DIAGRAM_GEN_SHAPE_LABEL_LEGEND[k] || k,
      color:
        k === 'note'
          ? _DIAGRAM_GEN_NOTE_COLOR_LEGEND
          : k === 'excluded'
            ? _DIAGRAM_GEN_EXCLUDED_COLOR_LEGEND
            : _DIAGRAM_GEN_PALETTE_LEGEND[_DIAGRAM_GEN_SHAPE_COLOR_LEGEND[k] || 'gray'],
    });
  });
  Object.keys(_DIAGRAM_GEN_MARKER_LABEL_LEGEND).forEach((k) => {
    if (markersUsed.has(k)) {
      entries.push({ label: _DIAGRAM_GEN_MARKER_LABEL_LEGEND[k], color: _DIAGRAM_GEN_PALETTE_LEGEND[_DIAGRAM_GEN_MARKER_COLOR_LEGEND[k]] });
    }
  });
  return entries;
}

/** Pure: matches index.html's own `diagramGenLegendCells` exactly — renders `entries` as a
 * vertical column of draw.io `<mxCell>` XML starting at `(x, y)`, each entry a small colored
 * square (14×14) plus a text label, 22px apart vertically. */
export function diagramGenLegendCellsCore(entries: LegendEntry[], x: number, y: number): string {
  let out = '';
  entries.forEach((e, i) => {
    const ey = y + i * 22;
    out += `<mxCell id="gd-legend-sw${i}" style="rounded=0;whiteSpace=wrap;html=1;fillColor=${e.color.fill};strokeColor=${e.color.stroke};" vertex="1" parent="1"><mxGeometry x="${x}" y="${ey}" width="14" height="14" as="geometry" /></mxCell>\n`;
    out += `<mxCell id="gd-legend-lbl${i}" value="${escXmlAttrLocal(e.label)}" style="text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor=#5F5E5A;" vertex="1" parent="1"><mxGeometry x="${x + 20}" y="${ey - 3}" width="150" height="20" as="geometry" /></mxCell>\n`;
  });
  return out;
}
