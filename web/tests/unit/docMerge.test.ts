import { describe, it, expect } from 'vitest';
import { mergeDocs } from '../../src/state/docMerge';

const r = (id: number, text: string, depth = 0, extra: object = {}) => ({ id, text, depth, note: '', ...extra });
const doc = (rows: ReturnType<typeof r>[], extra: object = {}) => ({ nodes: rows, nextId: Math.max(0, ...rows.map((x) => x.id)) + 1, title: 'Plan', ...extra });
const texts = (d: { nodes?: Array<Record<string, unknown>> }) => (d.nodes || []).map((x) => x.text);

describe('mergeDocs', () => {
  const base = doc([r(1, 'Goal'), r(2, 'Scope'), r(3, 'Risks')]);

  it('edits to different rows are both kept, with no conflict', () => {
    const mine = doc([r(1, 'Goal'), r(2, 'Scope, revised'), r(3, 'Risks')]);
    const theirs = doc([r(1, 'Goal — Q4'), r(2, 'Scope'), r(3, 'Risks')]);
    const m = mergeDocs(base, mine, theirs);
    expect(texts(m.doc)).toEqual(['Goal — Q4', 'Scope, revised', 'Risks']);
    expect(m.conflicts).toBe(0);
    expect(m.changedFromTheirs).toBe(true);
  });

  it('the same row edited differently on both sides keeps the account\'s, as a conflict', () => {
    const m = mergeDocs(base, doc([r(1, 'Mine'), r(2, 'Scope'), r(3, 'Risks')]), doc([r(1, 'Theirs'), r(2, 'Scope'), r(3, 'Risks')]));
    expect(texts(m.doc)).toEqual(['Theirs', 'Scope', 'Risks']);
    expect(m.conflicts).toBe(1);
  });

  it('rows added on both sides are all kept, in place; the same new id becomes two rows', () => {
    // Both devices numbered their new row 4.
    const mine = doc([r(1, 'Goal'), r(4, 'Mine after Goal'), r(2, 'Scope'), r(3, 'Risks')]);
    const theirs = doc([r(1, 'Goal'), r(2, 'Scope'), r(3, 'Risks'), r(4, 'Theirs at the end')]);
    const m = mergeDocs(base, mine, theirs);
    expect(texts(m.doc)).toEqual(['Goal', 'Mine after Goal', 'Scope', 'Risks', 'Theirs at the end']);
    expect(m.idRemap).toEqual({ 4: 5 });
    expect(m.doc.nodes!.map((x) => x.id)).toEqual([1, 5, 2, 3, 4]);
    expect(m.doc.nextId).toBe(6);
    expect(m.conflicts).toBe(0);
  });

  it('a row deleted on one side goes, unless the other side edited it', () => {
    const goes = mergeDocs(base, doc([r(1, 'Goal'), r(3, 'Risks')]), doc([r(1, 'Goal'), r(2, 'Scope'), r(3, 'Risks'), r(4, 'New')]));
    expect(texts(goes.doc)).toEqual(['Goal', 'Risks', 'New']);
    expect(goes.conflicts).toBe(0);
    const stays = mergeDocs(base, doc([r(1, 'Goal'), r(3, 'Risks')]), doc([r(1, 'Goal'), r(2, 'Scope edited'), r(3, 'Risks')]));
    expect(texts(stays.doc)).toEqual(['Goal', 'Scope edited', 'Risks']);
    expect(stays.conflicts).toBe(1);
  });

  it('indents merge per row and stay valid', () => {
    const mine = doc([r(1, 'Goal'), r(2, 'Scope', 1), r(3, 'Risks')]);
    const theirs = doc([r(1, 'Goal'), r(2, 'Scope'), r(3, 'Risks', 1)]);
    expect(mergeDocs(base, mine, theirs).doc.nodes!.map((x) => x.depth)).toEqual([0, 1, 1]);
    // The parent of an indented row deleted on the other side: the indent is lowered.
    const b2 = doc([r(1, 'A'), r(2, 'B', 1)]);
    const m2 = mergeDocs(b2, doc([r(2, 'B', 1)]), doc([r(1, 'A'), r(2, 'B', 1)]));
    expect(m2.doc.nodes!.map((x) => [x.text, x.depth])).toEqual([['B', 0]]);
  });

  it('this device\'s reordering is kept when the account\'s order didn\'t change', () => {
    const mine = doc([r(3, 'Risks'), r(1, 'Goal'), r(2, 'Scope')]);
    const theirs = doc([r(1, 'Goal'), r(2, 'Scope edited'), r(3, 'Risks'), r(4, 'Added there')]);
    expect(texts(mergeDocs(base, mine, theirs).doc)).toEqual(['Risks', 'Added there', 'Goal', 'Scope edited']); // the new row stays after the row it followed there
  });

  it('title and status merge the same way; nothing changed here gives the account\'s copy', () => {
    const m = mergeDocs(base, doc(base.nodes, { title: 'Plan v2' }), doc(base.nodes, { docStatus: 'approved' }));
    expect([m.doc.title, m.doc.docStatus]).toEqual(['Plan v2', 'approved']);
    const same = mergeDocs(base, base, doc([...base.nodes, r(4, 'x')]));
    expect(same.changedFromTheirs).toBe(false);
    expect(same.conflicts).toBe(0);
  });

  it('a note or other row content counts as an edit; a new modifiedAt alone does not', () => {
    const m = mergeDocs(base, doc([r(1, 'Goal', 0, { note: 'why' }), r(2, 'Scope'), r(3, 'Risks')]), doc([r(1, 'Goal', 0, { modifiedAt: 9 }), r(2, 'Scope'), r(3, 'Risks')]));
    expect(m.doc.nodes![0].note).toBe('why');
    expect(m.conflicts).toBe(0);
  });
  it('a stale nextId (lower than the ids in use) never makes two rows share an id', () => {
    const b = { nodes: [r(1, 'A'), r(5, 'E')], nextId: 3 };
    const m = mergeDocs(b, { nodes: [r(1, 'A'), r(5, 'E'), r(6, 'Mine')], nextId: 3 }, { nodes: [r(1, 'A'), r(5, 'E'), r(6, 'Theirs')], nextId: 3 });
    const list = m.doc.nodes!.map((x) => x.id);
    expect(new Set(list).size).toBe(list.length);
    expect(Number(m.doc.nextId)).toBeGreaterThan(Math.max(...list.map(Number)));
    expect(texts(m.doc)).toContain('Mine');
    expect(texts(m.doc)).toContain('Theirs');
  });
  it('a copy with fewer fields (an older app, not normalised) doesn\'t look edited', () => {
    const full = (id: number, text: string) => ({ id, text, depth: 0, note: '', noteTitle: '', tables: [], images: [], tags: [], checked: false, isCheckbox: false, marker: '', styles: { bold: false, heading: 0 }, createdAt: 5, completedAt: null });
    const b = { nodes: [full(1, 'A'), full(2, 'B')], nextId: 3 };
    const mine = { nodes: [full(1, 'A, edited here'), full(2, 'B')], nextId: 3 };
    const theirs = { nodes: [{ id: 1, text: 'A', depth: 0 }, { id: 2, text: 'B, edited there', depth: 0 }], nextId: 3 };
    const m = mergeDocs(b, mine, theirs);
    expect(texts(m.doc)).toEqual(['A, edited here', 'B, edited there']);
    expect(m.conflicts).toBe(0);
  });
});
