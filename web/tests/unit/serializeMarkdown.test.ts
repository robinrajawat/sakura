import { describe, it, expect } from 'vitest';
import { computeOutlineNumbers, serializeMarkdown, type OutlineNode } from '../../src/utils/serializeMarkdown';

// Pinned local oracles — literal copies of index.html's current implementations, modified
// only to accept the two settings (outlineNumbering, and the node list itself) as explicit
// parameters instead of reading them from module-level globals, matching the same minimal
// change made in the real extraction.
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
function originalSerializeMarkdown(scopeNodes: OutlineNode[], rebaseDepth: boolean, outlineNumbering: boolean): string {
  if (!scopeNodes.length) return '';
  const minDepth = rebaseDepth ? Math.min(...scopeNodes.map((n) => n.depth)) : 0;
  const numbers = originalComputeOutlineNumbers(scopeNodes, outlineNumbering);
  return scopeNodes
    .map((node, idx) => `${'  '.repeat(Math.max(0, node.depth - minDepth))}- ${numbers[idx] ? numbers[idx] + ' ' : ''}${String(node.text || '')}`)
    .join('\n');
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

describe('serializeMarkdown', () => {
  it('returns an empty string for an empty node list', () => {
    expect(serializeMarkdown([], false, false)).toBe('');
  });

  it('serializes a flat list without numbering', () => {
    const list: OutlineNode[] = [{ depth: 0, text: 'first' }, { depth: 0, text: 'second' }];
    expect(serializeMarkdown(list, false, false)).toBe('- first\n- second');
  });

  it('serializes nested nodes with correct indentation', () => {
    expect(serializeMarkdown(flatTree, false, false)).toBe(
      '- Root A\n  - Child A1\n  - Child A2\n- Root B\n  - Child B1\n    - Grandchild B1a'
    );
  });

  it('includes outline numbers when requested', () => {
    const list: OutlineNode[] = [{ depth: 0, text: 'a' }, { depth: 1, text: 'b' }];
    expect(serializeMarkdown(list, false, true)).toBe('- 1 a\n  - 1.1 b');
  });

  it('rebases depth so a subtree starts at the top level', () => {
    const subtree: OutlineNode[] = [{ depth: 2, text: 'x' }, { depth: 3, text: 'y' }];
    expect(serializeMarkdown(subtree, true, false)).toBe('- x\n  - y');
    expect(serializeMarkdown(subtree, false, false)).toBe('    - x\n      - y');
  });

  it('strips semantic markers from node text (unlike the plain-text oracle, which does not)', () => {
    const list: OutlineNode[] = [{ depth: 0, text: '[[Linked]] item' }];
    expect(serializeMarkdown(list, false, false)).toBe('- Linked item');
  });

  it('handles a node with missing text', () => {
    const list: OutlineNode[] = [{ depth: 0 }];
    expect(serializeMarkdown(list, false, false)).toBe('- ');
  });

  it('matches the pinned original for a representative set of inputs (plain text, no markers)', () => {
    // The oracle intentionally does NOT run stripSemanticMarkers (kept simple, since that's
    // already covered by stripSemanticMarkers.test.ts) — so this comparison uses marker-free
    // text, where both implementations must produce byte-identical output.
    const cases: Array<[OutlineNode[], boolean, boolean]> = [
      [flatTree, false, false],
      [flatTree, false, true],
      [flatTree, true, false],
      [flatTree, true, true],
      [[], false, false],
    ];
    for (const [list, rebase, numbering] of cases) {
      expect(serializeMarkdown(list, rebase, numbering)).toBe(originalSerializeMarkdown(list, rebase, numbering));
    }
  });
});
