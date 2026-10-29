import { describe, expect, it } from 'vitest';
import { isLargeRemoval, mergeVersionLists, pickVersionToDrop, trimVersions } from '../../src/utils/versionHistory';

const M = 60000;
const H = 60 * M;
const D = 24 * H;

function simulate(days: number, max: number) {
  let list: { ts: number; reason?: string }[] = [];
  let t = 0;
  for (let day = 0; day < days; day++) {
    for (let k = 0; k < 48; k++) {
      t = day * D + 9 * H + k * 10 * M;
      list = trimVersions([...list, { ts: t, reason: 'Auto' }], max, t);
    }
  }
  return { list, now: t };
}

describe('trimVersions', () => {
  it('keeps the list as is while under the limit, sorted oldest first', () => {
    const list = [{ ts: 3 }, { ts: 1 }, { ts: 2 }];
    expect(trimVersions(list, 10, 10).map((v) => v.ts)).toEqual([1, 2, 3]);
  });

  it('spreads 10 versions back over days instead of the last 100 minutes', () => {
    const { list, now } = simulate(5, 10);
    expect(list).toHaveLength(10);
    const ages = list.map((v) => now - v.ts);
    expect(ages[0]).toBeGreaterThan(3 * D); // still reaches back to the first days
    expect(ages[ages.length - 1]).toBe(0); // the newest always stays
    expect(ages.filter((a) => a <= H).length).toBeGreaterThanOrEqual(4); // and the last hour stays dense
  });

  it('reaches back further the longer you work', () => {
    const { list, now } = simulate(20, 10);
    expect(now - list[0].ts).toBeGreaterThan(14 * D);
    expect(list.some((v) => now - v.ts > 6 * D && now - v.ts < 8 * D)).toBe(true);
  });

  it('drops an automatic version before a named one in the same spot', () => {
    const list = [{ ts: 0 }, { ts: 10 * M, reason: 'Manual checkpoint' }, { ts: 11 * M }, { ts: 12 * M }, { ts: 60 * M }];
    const out = trimVersions(list, 4, 60 * M);
    expect(out.map((v) => v.reason || 'Auto')).toContain('Manual checkpoint');
    expect(out.map((v) => v.ts)).toEqual([0, 10 * M, 12 * M, 60 * M]);
  });

  it('never drops the newest', () => {
    expect(pickVersionToDrop([{ ts: 0 }, { ts: 1 }], 2)).toBe(0);
    expect(pickVersionToDrop([{ ts: 0 }], 2)).toBe(-1);
  });
});

describe('mergeVersionLists', () => {
  it('joins two devices’ lists, one copy per time', () => {
    const a = [{ ts: 1, reason: 'Auto' }, { ts: 3, reason: 'Auto' }];
    const b = [{ ts: 2, reason: 'Auto' }, { ts: 3, reason: 'Auto' }];
    expect(mergeVersionLists(a, b, 5, 4).map((v) => v.ts)).toEqual([1, 2, 3]);
  });
  it('stays within the limit', () => {
    const a = [1, 2, 3, 4].map((ts) => ({ ts: ts * H }));
    const b = [5, 6, 7].map((ts) => ({ ts: ts * H }));
    expect(mergeVersionLists(a, b, 5, 8 * H)).toHaveLength(5);
  });
});

describe('isLargeRemoval', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  it('is true for Clear all rows and deleting half a document', () => {
    expect(isLargeRemoval(rows(6), [])).toBe(true);
    expect(isLargeRemoval(rows(6), rows(3))).toBe(true);
    expect(isLargeRemoval(rows(100), rows(90))).toBe(true);
  });
  it('is false for everyday edits', () => {
    expect(isLargeRemoval(rows(6), rows(5))).toBe(false);
    expect(isLargeRemoval(rows(2), [])).toBe(false);
    expect(isLargeRemoval(rows(5), [...rows(5), { id: 9 }])).toBe(false);
    expect(isLargeRemoval(rows(100), rows(91))).toBe(false);
  });
  it('counts thread entries too', () => {
    expect(isLargeRemoval(rows(3), rows(3), rows(5), [])).toBe(true);
    expect(isLargeRemoval(rows(3), rows(3), rows(5), rows(1))).toBe(false);
  });
});
