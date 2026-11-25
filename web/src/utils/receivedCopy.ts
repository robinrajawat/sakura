/**
 * A document that arrives in the inbox (Send a copy, or a draft from your AI assistant's
 * send_document), made safe and well-formed before it can become a document (owner 2026-11-25:
 * "should not end up in a duplicate, corrupt document").
 *
 * - Stored HTML is cleaned on the way in (standing rule): notes, tables and thread entries, through
 *   the cleaners the caller passes (index.html's sakuraSanitizeRichHtml / tidyTableHtml).
 * - It is repaired: unique positive row ids, indents that step down one level at a time, parent
 *   links from the indents (the rule rebuildParentIdsCore applies in the editor; that one needs the
 *   app's globals, so it can't run here), a next id past every row, diagrams with
 *   an id and a drawing, anchored to a row that exists, and thread entries only on existing rows.
 * - `docIdForCopy` gives each inbox item one document id, so adding it twice, or on two devices,
 *   lands on the same document.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `receivedCopy` block.
 */

export interface CopyCleaners {
  sanitize: (html: string) => string;
  tidyTable: (html: string) => string;
  newDiagramId: () => string;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);

/** The document id an inbox item becomes: the same every time, on every device. */
export function docIdForCopy(copyId: string): string {
  return 'dc' + String(copyId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
}

/** Cleans and repairs a received document in place, and returns it. */
export function cleanReceivedCopy(d: Rec, c: CopyCleaners): Rec {
  if (!isRec(d)) return d;
  const seen = new Set<number>();
  let maxId = 0;
  let prevDepth = -1;
  const nodes = (Array.isArray(d.nodes) ? d.nodes : []).filter(isRec).map((n) => {
    let id = Number(n.id);
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) id = 0;
    if (id) { seen.add(id); maxId = Math.max(maxId, id); }
    const asked = Number(n.depth);
    const depth = Math.max(0, Math.min(Number.isInteger(asked) ? asked : 0, prevDepth + 1));
    prevDepth = depth;
    return {
      ...n, id, depth, parentId: null as number | null,
      styles: isRec(n.styles) ? n.styles : {},
      text: typeof n.text === 'string' ? n.text : '',
      note: typeof n.note === 'string' ? c.sanitize(n.note) : '',
      tables: Array.isArray(n.tables) ? n.tables.filter((t): t is string => typeof t === 'string').map((t) => c.tidyTable(c.sanitize(t))) : [],
      images: Array.isArray(n.images) ? n.images : []
    };
  });
  for (const n of nodes) if (!n.id) { n.id = ++maxId; seen.add(n.id); }
  const parent: number[] = [];
  for (const n of nodes) { parent.length = n.depth; n.parentId = n.depth ? parent[n.depth - 1] ?? null : null; parent[n.depth] = n.id; }
  d.nodes = nodes;
  d.nextId = maxId + 1;
  d.title = typeof d.title === 'string' ? d.title : '';
  const firstRow = nodes[0]?.id ?? null;
  d.diagrams = (Array.isArray(d.diagrams) ? d.diagrams : [])
    .filter((g): g is Rec => isRec(g) && typeof g.xml === 'string' && !!g.xml.trim())
    .map((g) => ({ ...g, id: typeof g.id === 'string' && g.id ? g.id : c.newDiagramId(), anchorNodeId: seen.has(Number(g.anchorNodeId)) ? Number(g.anchorNodeId) : firstRow }));
  d.remarks = (Array.isArray(d.remarks) ? d.remarks : []).filter((r): r is Rec => isRec(r) && seen.has(Number(r.anchorNodeId))).map((r) => {
    const out: Rec = { ...r };
    for (const k of ['text', 'title']) if (typeof out[k] === 'string') out[k] = c.sanitize(out[k] as string);
    return out;
  });
  return d;
}
