import { describe, it, expect } from 'vitest';
import { mergeThreadEntries, mergeTombstones, addTombstone, TOMBSTONE_MAX_AGE_MS } from '../../src/state/threadMerge';

const e = (id: string, row: number, createdAt: number, extra: object = {}) => ({ id, anchorNodeId: row, createdAt, text: id, ...extra });
const NOW = 1_800_000_000_000;

describe('threadMerge', () => {
  it('keeps the kept copy\'s entries and adds the ones only this device has', () => {
    const r = mergeThreadEntries([e('a', 1, 1)], {}, [e('a', 1, 1), e('b', 1, 2)], {}, [1], NOW);
    expect(r.remarks.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.added).toBe(1);
  });

  it('an entry both copies have keeps the kept copy\'s version', () => {
    const r = mergeThreadEntries([e('a', 1, 1, { text: 'theirs' })], {}, [e('a', 1, 1, { text: 'mine' })], {}, [1], NOW);
    expect(r.remarks).toEqual([e('a', 1, 1, { text: 'theirs' })]);
    expect(r.added).toBe(0);
  });

  it('an entry deleted in the kept copy is not brought back', () => {
    const r = mergeThreadEntries([], { b: NOW - 10 }, [e('b', 1, 2)], {}, [1], NOW);
    expect(r.remarks).toEqual([]);
    expect(r.added).toBe(0);
  });

  it('a deletion made only on this device does not remove the kept copy\'s entry', () => {
    const r = mergeThreadEntries([e('a', 1, 1)], {}, [], { a: NOW - 10 }, [1], NOW);
    expect(r.remarks.map((x) => x.id)).toEqual(['a']);
    expect(r.remarkTombstones).toEqual({ a: NOW - 10 });
  });

  it('an entry on a row the kept copy doesn\'t have stays out (it is in Version history)', () => {
    const r = mergeThreadEntries([], {}, [e('b', 9, 2)], {}, [1], NOW);
    expect(r.remarks).toEqual([]);
  });

  it('entries come out in time order, and a reply to a missing entry stops pointing at it', () => {
    const r = mergeThreadEntries([e('c', 1, 3)], {}, [e('a', 1, 1), e('b', 1, 2, { answerTo: 'gone' })], {}, [1], NOW);
    expect(r.remarks.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.remarks[1].answerTo).toBeUndefined();
  });

  it('copes with missing lists and ids', () => {
    expect(mergeThreadEntries(null, null, undefined, undefined, [], NOW)).toEqual({ remarks: [], remarkTombstones: {}, added: 0 });
    expect(mergeThreadEntries([{ anchorNodeId: 1 } as never], {}, [], {}, [1], NOW).remarks).toEqual([]);
  });

  it('deletion records: both kept, the later time wins, old ones dropped', () => {
    expect(addTombstone(null, 7, 5)).toEqual({ '7': 5 });
    const t = mergeTombstones({ a: NOW - 5, old: NOW - TOMBSTONE_MAX_AGE_MS - 1 }, { a: NOW - 1, b: NOW - 2, bad: 'x' as never }, NOW);
    expect(t).toEqual({ a: NOW - 1, b: NOW - 2 });
  });
});
