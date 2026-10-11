import { describe, it, expect } from 'vitest';
import { computeOutlineNumbers, type OutlineNode } from '../../src/utils/computeOutlineNumbers';

// Pinned local oracle — a literal copy of index.html's original implementation, modified
// only to accept outlineNumbering as an explicit parameter instead of reading it from a
// module-level global, matching the same minimal change made in the real extraction.
function originalComputeOutlineNumbers(list: OutlineNode[], outlineNumbering: boolean): string[] {
  if (!outlineNumbering) return list.map(() => '');
  const counters: number[] = [];
  return list.map((node) => {
    const depth = node.depth || 0;
    counters.length = depth + 1;
    counters[depth] = (counters[depth] || 0) + 1;
    return counters.slice(0, depth + 1).join('.');
  });
}

const flatTree: OutlineNode[] = [
  { depth: 0, text: 'Root A' },
  { depth: 1, text: 'Child A1' },
  { depth: 1, text: 'Child A2' },
  { depth: 0, text: 'Root B' },
  { depth: 1, text: 'Child B1' },
  { depth: 2, text: 'Grandchild B1a' },
];

describe('computeOutlineNumbers', () => {
  it('returns empty strings for every node when outlineNumbering is false', () => {
    expect(computeOutlineNumbers(flatTree, false)).toEqual(['', '', '', '', '', '']);
  });

  it('computes dotted outline numbers when outlineNumbering is true', () => {
    expect(computeOutlineNumbers(flatTree, true)).toEqual(['1', '1.1', '1.2', '2', '2.1', '2.1.1']);
  });

  it('handles a single flat list with no nesting', () => {
    const list: OutlineNode[] = [{ depth: 0, text: 'a' }, { depth: 0, text: 'b' }, { depth: 0, text: 'c' }];
    expect(computeOutlineNumbers(list, true)).toEqual(['1', '2', '3']);
  });

  it('handles an empty list', () => {
    expect(computeOutlineNumbers([], true)).toEqual([]);
    expect(computeOutlineNumbers([], false)).toEqual([]);
  });

  it('matches the pinned original for both numbering states', () => {
    expect(computeOutlineNumbers(flatTree, true)).toEqual(originalComputeOutlineNumbers(flatTree, true));
    expect(computeOutlineNumbers(flatTree, false)).toEqual(originalComputeOutlineNumbers(flatTree, false));
  });
});
