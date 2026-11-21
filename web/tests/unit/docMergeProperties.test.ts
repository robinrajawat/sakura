import { describe, it, expect } from 'vitest';
import { mergeDocs, mergeRowContent, type MergeDoc, type MergeRow } from '../../src/state/docMerge';

// Randomised checks of the row merge (owner 2026-11-21: "we have to be absolutely sure that there
// are no bugs in this auto merging"). Thousands of random two-device edit sequences from one shared
// copy; after each merge, rules that must always hold are checked.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
type Ops = { edited: Set<number>; deleted: Set<number>; added: Map<number, string>; moved: Set<number>; reordered: boolean };

function validDepths(rows: MergeRow[]) {
  let last = -1;
  for (const r of rows) {
    const d = Number(r.depth);
    if (!(d >= 0) || d > last + 1) return false;
    last = d;
  }
  return true;
}
function fixDepths(rows: MergeRow[]) {
  let last = -1;
  for (const r of rows) { r.depth = Math.min(Number(r.depth) || 0, last + 1); last = r.depth; }
  return rows;
}

function makeBase(rand: () => number): MergeDoc {
  const n = 1 + Math.floor(rand() * 8);
  const rows: MergeRow[] = [];
  for (let i = 1; i <= n; i++) rows.push({ id: i, text: 'r' + i, depth: Math.floor(rand() * 3), note: '' });
  return { nodes: fixDepths(rows), nextId: n + 1, title: 'T' };
}

function mutate(base: MergeDoc, rand: () => number, side: string): { doc: MergeDoc; ops: Ops } {
  const rows: MergeRow[] = (base.nodes || []).map((r) => ({ ...r }));
  let nextId = Number(base.nextId);
  const ops: Ops = { edited: new Set(), deleted: new Set(), added: new Map(), moved: new Set(), reordered: false };
  const steps = Math.floor(rand() * 5);
  for (let s = 0; s < steps; s++) {
    const k = rand();
    if (k < 0.3 && rows.length) {
      const r = rows[Math.floor(rand() * rows.length)];
      r.text = String(r.text) + '+' + side + s;
      if (ops.added.has(Number(r.id))) ops.added.set(Number(r.id), String(r.text)); // an added row edited again
      else if (base.nodes!.some((b) => b.id === r.id)) ops.edited.add(Number(r.id));
    } else if (k < 0.5 && rows.length) {
      const i = Math.floor(rand() * rows.length);
      const [r] = rows.splice(i, 1);
      if (ops.added.has(Number(r.id))) ops.added.delete(Number(r.id));
      else { ops.deleted.add(Number(r.id)); ops.edited.delete(Number(r.id)); }
    } else if (k < 0.75) {
      // Both devices number new rows from the same nextId, as the app does.
      const id = nextId++;
      const text = 'new-' + side + '-' + s;
      rows.splice(Math.floor(rand() * (rows.length + 1)), 0, { id, text, depth: Math.floor(rand() * 2), note: '' });
      ops.added.set(id, text);
    } else if (k < 0.88 && rows.length) {
      const r = rows[Math.floor(rand() * rows.length)];
      r.depth = (Number(r.depth) || 0) + 1;
      if (base.nodes!.some((b) => b.id === r.id)) ops.moved.add(Number(r.id));
    } else if (rows.length > 1) {
      const i = Math.floor(rand() * rows.length), j = Math.floor(rand() * rows.length);
      [rows[i], rows[j]] = [rows[j], rows[i]];
      ops.reordered = true;
    }
  }
  fixDepths(rows);
  return { doc: { nodes: rows, nextId, title: 'T' }, ops };
}

const ids = (d: MergeDoc) => (d.nodes || []).map((r) => r.id);
const texts = (d: MergeDoc) => (d.nodes || []).map((r) => r.text);

describe('mergeDocs: properties over random two-device edits', () => {
  const RUNS = 4000;

  it('ids are unique and below nextId; indents are valid', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed);
      const base = makeBase(rand);
      const m = mutate(base, rand, 'm'), t = mutate(base, rand, 't');
      const r = mergeDocs(base, m.doc, t.doc);
      const list = ids(r.doc).map(Number);
      expect(new Set(list).size, 'seed ' + seed).toBe(list.length);
      expect(list.every((x) => x < Number(r.doc.nextId)), 'seed ' + seed).toBe(true);
      expect(validDepths(r.doc.nodes || []), 'seed ' + seed).toBe(true);
    }
  });

  it('a change on one side only gives exactly that side, with no conflict', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed);
      const base = makeBase(rand);
      const t = mutate(base, rand, 't').doc;
      const onlyTheirs = mergeDocs(base, base, t);
      expect(texts(onlyTheirs.doc), 'seed ' + seed).toEqual(texts(t));
      expect(ids(onlyTheirs.doc), 'seed ' + seed).toEqual(ids(t));
      expect(onlyTheirs.conflicts).toBe(0);
      expect(onlyTheirs.changedFromTheirs, 'seed ' + seed).toBe(false);
      const m = mutate(base, rand, 'm').doc;
      const onlyMine = mergeDocs(base, m, base);
      expect(texts(onlyMine.doc), 'seed ' + seed).toEqual(texts(m));
      expect(onlyMine.doc.nodes!.map((x) => x.depth), 'seed ' + seed).toEqual(m.nodes!.map((x) => x.depth));
      expect(onlyMine.conflicts).toBe(0);
    }
  });

  it('nothing is lost: added rows stay, one-sided edits survive, untouched deletions go', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed);
      const base = makeBase(rand);
      const m = mutate(base, rand, 'm'), t = mutate(base, rand, 't');
      const r = mergeDocs(base, m.doc, t.doc);
      const out = texts(r.doc);
      for (const txt of m.ops.added.values()) expect(out, 'seed ' + seed + ' mine added').toContain(txt);
      for (const txt of t.ops.added.values()) expect(out, 'seed ' + seed + ' theirs added').toContain(txt);
      const byId = new Map((r.doc.nodes || []).map((x) => [Number(x.id), x]));
      const mRow = new Map((m.doc.nodes || []).map((x) => [Number(x.id), x]));
      const tRow = new Map((t.doc.nodes || []).map((x) => [Number(x.id), x]));
      for (const b of base.nodes || []) {
        const id = Number(b.id);
        const mEd = m.ops.edited.has(id), tEd = t.ops.edited.has(id), mDel = m.ops.deleted.has(id), tDel = t.ops.deleted.has(id);
        if (mEd && !tEd && !tDel) expect(byId.get(id)?.text, 'seed ' + seed).toBe(mRow.get(id)!.text);
        if (tEd && !mEd && !mDel) expect(byId.get(id)?.text, 'seed ' + seed).toBe(tRow.get(id)!.text);
        if (mDel && !tEd) expect(byId.has(id), 'seed ' + seed + ' deleted here').toBe(false);
        if (tDel && !mEd) expect(byId.has(id), 'seed ' + seed + ' deleted there').toBe(false);
        if (mDel && tEd) expect(byId.get(id)?.text, 'seed ' + seed + ' edit beats delete').toBe(tRow.get(id)!.text);
        if (tDel && mEd) expect(byId.get(id)?.text, 'seed ' + seed + ' edit beats delete').toBe(mRow.get(id)!.text);
      }
    }
  });

  it('no conflict when the two sides changed different rows', () => {
    let checked = 0;
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed);
      const base = makeBase(rand);
      const m = mutate(base, rand, 'm'), t = mutate(base, rand, 't');
      const touched = (o: Ops) => new Set([...o.edited, ...o.deleted]);
      const tm = touched(m.ops), tt = touched(t.ops);
      if ([...tm].some((x) => tt.has(x))) continue;
      checked++;
      expect(mergeDocs(base, m.doc, t.doc).conflicts, 'seed ' + seed).toBe(0);
    }
    expect(checked).toBeGreaterThan(RUNS / 4);
  });

  it('merging the result again changes nothing', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rand = rng(seed);
      const base = makeBase(rand);
      const m = mutate(base, rand, 'm'), t = mutate(base, rand, 't');
      const r = mergeDocs(base, m.doc, t.doc).doc;
      const again = mergeDocs(t.doc, r, t.doc);
      expect(again.doc.nodes!.map(mergeRowContent), 'seed ' + seed).toEqual(r.nodes!.map(mergeRowContent));
      expect(ids(again.doc), 'seed ' + seed).toEqual(ids(r));
      expect(again.conflicts).toBe(0);
    }
  });
});
