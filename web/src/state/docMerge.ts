/**
 * Three-way merge of a document's rows when two devices changed it (owner 2026-11-21: edits made
 * in the installed iPhone app and in Safari kept ending up in Version history as "Your edits, set
 * aside", because the account's copy was kept whole and this device's copy was put away).
 *
 * `base` is the copy both devices last agreed on (the account's copy this device's edits started
 * from), `mine` this device's copy, `theirs` the account's newer copy. Rows are matched by id:
 *
 * - A row changed on one side only takes that side's change. Text and everything else in the row
 *   (note, tables, pictures, marks) count as its content; its indent is merged separately.
 * - A row changed differently on both sides keeps the account's version: a conflict.
 * - A row added on either side is kept. When both sides added a row with the same id (each device
 *   numbers new rows from the same nextId), this device's row gets a new id (`idRemap`).
 * - A row deleted on one side goes, unless the other side edited it: then it stays (a conflict).
 * - Order: the account's order, with this device's new rows placed after the row they followed
 *   here; if only this device reordered rows, this device's order is used instead.
 * - Indents are made valid again (a row is at most one level deeper than the row above it).
 * - The title, author, status, link and Q&A merge as whole values the same way. Diagrams are
 *   compared by the caller (their stored form differs between devices: see mergeDocCopies).
 *
 * `conflicts` counts what couldn't be merged; the caller keeps this device's copy in Version
 * history only then. Thread entries are merged separately (threadMerge.ts). Pure.
 */

export type MergeRow = { id: number | string; depth?: number; parentId?: unknown; modifiedAt?: unknown; [k: string]: unknown };
export type MergeDoc = { nodes?: MergeRow[]; nextId?: number; [k: string]: unknown };
export type DocMergeResult = { doc: MergeDoc; conflicts: number; idRemap: Record<string, number>; changedFromTheirs: boolean };

/** Fields merged as whole values. */
export const DOC_MERGE_FIELDS = ['title', 'author', 'docStatus', 'docLinkedUrl', 'docLinkedUrlLabel', 'qa'];

function dmStable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x) ?? 'undefined';
}
/** A row's content: everything but where it sits and when it was last touched. */
export function mergeRowContent(r: MergeRow): string {
  const { id: _i, depth: _d, parentId: _p, modifiedAt: _m, ...rest } = r;
  return dmStable(rest);
}

/** The side that changed, or the account's on a real conflict. */
function dmPick3<T>(b: T, m: T, t: T, eq: (x: T, y: T) => boolean): { v: T; conflict: boolean } {
  if (eq(m, b)) return { v: t, conflict: false };
  if (eq(t, b)) return { v: m, conflict: false };
  if (eq(m, t)) return { v: t, conflict: false };
  return { v: t, conflict: true };
}

function dmById(rows: MergeRow[] | undefined): Map<string, MergeRow> {
  const m = new Map<string, MergeRow>();
  for (const r of Array.isArray(rows) ? rows : []) if (r && r.id != null) m.set(String(r.id), r);
  return m;
}

export function mergeDocs(base: MergeDoc, mine: MergeDoc, theirs: MergeDoc): DocMergeResult {
  const B = dmById(base.nodes), M = dmById(mine.nodes), T = dmById(theirs.nodes);
  const mineOrder = (mine.nodes || []).map((r) => String(r.id));
  const theirOrder = (theirs.nodes || []).map((r) => String(r.id));
  const baseOrder = (base.nodes || []).map((r) => String(r.id));
  let conflicts = 0;
  const idRemap: Record<string, number> = {};
  let maxId = 0;
  for (const m of [B, M, T]) for (const r of m.values()) { const n = Number(r.id); if (Number.isFinite(n) && n > maxId) maxId = n; }
  maxId = Math.max(maxId, Number(base.nextId) || 0, Number(mine.nextId) || 0, Number(theirs.nextId) || 0) - 1;

  // Rows to keep, keyed by their id in the result.
  const out = new Map<string, MergeRow>();
  const mineKeyFor = new Map<string, string>(); // a row of mine -> its id in the result
  for (const id of new Set([...T.keys(), ...M.keys(), ...B.keys()])) {
    const b = B.get(id), m = M.get(id), t = T.get(id);
    if (b && m && t) {
      const c = dmPick3(mergeRowContent(b), mergeRowContent(m), mergeRowContent(t), (x, y) => x === y);
      const d = dmPick3(Number(b.depth) || 0, Number(m.depth) || 0, Number(t.depth) || 0, (x, y) => x === y);
      if (c.conflict) conflicts++;
      const src = c.v === mergeRowContent(m) && c.v !== mergeRowContent(t) ? m : t;
      out.set(id, { ...src, id: t.id, depth: d.v });
      mineKeyFor.set(id, id);
    } else if (b && !m && t) {
      if (mergeRowContent(t) !== mergeRowContent(b)) { conflicts++; out.set(id, { ...t }); } // edited there, deleted here: kept
    } else if (b && m && !t) {
      if (mergeRowContent(m) !== mergeRowContent(b)) { conflicts++; out.set(id, { ...m }); mineKeyFor.set(id, id); } // deleted there, edited here: kept
    } else if (!b && m && t) {
      if (mergeRowContent(m) === mergeRowContent(t)) { out.set(id, { ...t }); mineKeyFor.set(id, id); }
      else {
        // Both added a row with this id: two different rows. Theirs keeps it, mine gets a new one.
        out.set(id, { ...t });
        const nid = ++maxId;
        idRemap[id] = nid;
        out.set(String(nid), { ...m, id: nid });
        mineKeyFor.set(id, String(nid));
      }
    } else if (!b && m && !t) {
      out.set(id, { ...m }); mineKeyFor.set(id, id);
    } else if (!b && !m && t) {
      out.set(id, { ...t });
    }
    // b only: deleted on both sides.
  }

  // Order. Which side's order of the shared rows to follow.
  const shared = (order: string[]) => order.filter((id) => B.has(id) && M.has(id) && T.has(id));
  const sameOrder = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const useMine = sameOrder(shared(theirOrder), shared(baseOrder)) && !sameOrder(shared(mineOrder), shared(baseOrder));
  const skeleton = (useMine ? mineOrder.map((id) => mineKeyFor.get(id) || id) : theirOrder).filter((id) => out.has(id));
  const placed = new Set(skeleton);
  const result = [...skeleton];
  // The other side's rows not yet placed go after the row they followed on that side.
  const otherOrder = useMine ? theirOrder.map((id) => ({ src: id, key: id })) : mineOrder.map((id) => ({ src: id, key: mineKeyFor.get(id) || id }));
  let prev: string | null = null;
  for (const { key } of otherOrder) {
    if (!out.has(key)) continue;
    if (!placed.has(key)) {
      const at = prev === null ? 0 : result.indexOf(prev) + 1;
      result.splice(at, 0, key);
      placed.add(key);
    }
    prev = key;
  }
  for (const key of out.keys()) if (!placed.has(key)) result.push(key); // rows kept against a deletion, if not placed yet

  // Valid indents, and nothing below them pointing at a parent by an old guess.
  const nodes: MergeRow[] = [];
  let lastDepth = -1;
  for (const key of result) {
    const r = { ...out.get(key)! };
    const want = Math.max(0, Number(r.depth) || 0);
    r.depth = Math.min(want, lastDepth + 1);
    lastDepth = r.depth;
    nodes.push(r);
  }

  const doc: MergeDoc = { ...theirs, nodes };
  for (const f of DOC_MERGE_FIELDS) {
    const p = dmPick3(base[f], mine[f], theirs[f], (x, y) => dmStable(x) === dmStable(y));
    if (p.conflict) conflicts++;
    if (p.v !== undefined) doc[f] = p.v; else delete doc[f];
  }
  doc.nextId = Math.max(maxId + 1, Number(theirs.nextId) || 0, Number(mine.nextId) || 0);
  const changedFromTheirs = dmStable(nodes) !== dmStable(theirs.nodes || []) || DOC_MERGE_FIELDS.some((f) => dmStable(doc[f]) !== dmStable(theirs[f])) || doc.nextId !== theirs.nextId;
  return { doc, conflicts, idRemap, changedFromTheirs };
}
