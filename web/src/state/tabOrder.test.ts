import { describe, it, expect } from 'vitest';
import { computeNextTabDocId, reorderTabsCore, type OrderableTab } from './tabOrder';

function tabs(ids: (number | string)[]): OrderableTab[] {
  return ids.map((docId) => ({ docId }));
}

describe('computeNextTabDocId', () => {
  it('returns null when fewer than 2 tabs are open', () => {
    expect(computeNextTabDocId(tabs([]), null, 1)).toBeNull();
    expect(computeNextTabDocId(tabs([1]), 1, 1)).toBeNull();
  });

  it('cycles forward to the next tab, wrapping to the first after the last', () => {
    const t = tabs([1, 2, 3]);
    expect(computeNextTabDocId(t, 1, 1)).toBe(2);
    expect(computeNextTabDocId(t, 2, 1)).toBe(3);
    expect(computeNextTabDocId(t, 3, 1)).toBe(1);
  });

  it('cycles backward, wrapping to the last after the first', () => {
    const t = tabs([1, 2, 3]);
    expect(computeNextTabDocId(t, 1, -1)).toBe(3);
    expect(computeNextTabDocId(t, 2, -1)).toBe(1);
  });

  it('falls back to starting from index 0 when activeTabDocId is not found among openTabs', () => {
    const t = tabs([1, 2, 3]);
    expect(computeNextTabDocId(t, 999, 1)).toBe(2);
    expect(computeNextTabDocId(t, null, 1)).toBe(2);
  });

  it('works with exactly 2 tabs (the minimum for cycling)', () => {
    const t = tabs([1, 2]);
    expect(computeNextTabDocId(t, 1, 1)).toBe(2);
    expect(computeNextTabDocId(t, 2, 1)).toBe(1);
  });

  it('supports string docIds, not just numbers', () => {
    const t = tabs(['a', 'b', 'c']);
    expect(computeNextTabDocId(t, 'a', 1)).toBe('b');
  });
});

describe('reorderTabsCore', () => {
  it('is a no-op when draggedId equals targetId', () => {
    const t = tabs([1, 2, 3]);
    const result = reorderTabsCore(t, 2, 2, 'left');
    expect(result).toBe(false);
    expect(t.map((x) => x.docId)).toEqual([1, 2, 3]);
  });

  it('is a no-op when draggedId is not found', () => {
    const t = tabs([1, 2, 3]);
    const result = reorderTabsCore(t, 999, 2, 'left');
    expect(result).toBe(false);
    expect(t.map((x) => x.docId)).toEqual([1, 2, 3]);
  });

  it('is a no-op when targetId is not found', () => {
    const t = tabs([1, 2, 3]);
    const result = reorderTabsCore(t, 1, 999, 'left');
    expect(result).toBe(false);
    expect(t.map((x) => x.docId)).toEqual([1, 2, 3]);
  });

  it('moves a tab to just before the target on side "left"', () => {
    const t = tabs([1, 2, 3, 4]);
    const result = reorderTabsCore(t, 4, 2, 'left');
    expect(result).toBe(true);
    expect(t.map((x) => x.docId)).toEqual([1, 4, 2, 3]);
  });

  it('moves a tab to just after the target on side "right"', () => {
    const t = tabs([1, 2, 3, 4]);
    const result = reorderTabsCore(t, 1, 3, 'right');
    expect(result).toBe(true);
    expect(t.map((x) => x.docId)).toEqual([2, 3, 1, 4]);
  });

  it('handles moving a tab forward past multiple tabs', () => {
    const t = tabs([1, 2, 3, 4, 5]);
    reorderTabsCore(t, 1, 5, 'right');
    expect(t.map((x) => x.docId)).toEqual([2, 3, 4, 5, 1]);
  });

  it('handles moving a tab backward to the start', () => {
    const t = tabs([1, 2, 3, 4, 5]);
    reorderTabsCore(t, 5, 1, 'left');
    expect(t.map((x) => x.docId)).toEqual([5, 1, 2, 3, 4]);
  });

  it('mutates the array in place — same object reference, no new array returned', () => {
    const t = tabs([1, 2, 3]);
    const originalRef = t;
    reorderTabsCore(t, 3, 1, 'left');
    expect(t).toBe(originalRef);
  });

  it('preserves other tab properties (e.g. pinned) across the move', () => {
    const t: OrderableTab[] = [
      { docId: 1, pinned: true },
      { docId: 2 },
      { docId: 3 }
    ];
    reorderTabsCore(t, 1, 3, 'right');
    expect(t.find((x) => x.docId === 1)?.pinned).toBe(true);
  });

  it('dragging a tab immediately adjacent to itself on the correct side is still a real move', () => {
    // Moving tab 2 to just left of tab 1 when currently [1,2,3] should produce [2,1,3]
    const t = tabs([1, 2, 3]);
    const result = reorderTabsCore(t, 2, 1, 'left');
    expect(result).toBe(true);
    expect(t.map((x) => x.docId)).toEqual([2, 1, 3]);
  });
});
