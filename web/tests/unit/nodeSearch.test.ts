import { describe, it, expect } from 'vitest';
import { computeSearchMatchIds, resolveSearchIndex } from '../../src/core/nodeSearch';

interface TestNode {
  id: number;
  depth: number;
  text?: string;
}

function tree(texts: string[]): TestNode[] {
  return texts.map((text, i) => ({ id: i + 1, depth: 0, text }));
}

// Pinned local oracle — literal copy of index.html's current computeSearchMatches matching
// logic (the parts that don't touch searchMatches/searchIndex/DOM), modified only to accept its
// ambient reads as explicit parameters, same approach as nodeSelection.test.ts.
function oEscapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function oComputeSearchMatchIds(nodes: TestNode[], query: string, matchCase: boolean, wholeWord: boolean): number[] {
  const raw = query.trim();
  if (!raw) return [];
  let matches: number[];
  if (wholeWord) {
    const re = new RegExp('\\b' + oEscapeRegExpLiteral(raw) + '\\b', matchCase ? '' : 'i');
    matches = nodes.filter((n) => re.test(String(n.text || ''))).map((n) => n.id);
  } else if (matchCase) {
    matches = nodes.filter((n) => String(n.text || '').includes(raw)).map((n) => n.id);
  } else {
    const q = raw.toLowerCase();
    matches = nodes.filter((n) => String(n.text || '').toLowerCase().includes(q)).map((n) => n.id);
  }
  return matches;
}

describe('computeSearchMatchIds', () => {
  it('returns [] for an empty query', () => {
    const t = tree(['Hello world', 'Goodbye']);
    expect(computeSearchMatchIds(t, '', false, false)).toEqual([]);
  });

  it('returns [] for a whitespace-only query (trimmed to empty)', () => {
    const t = tree(['Hello world']);
    expect(computeSearchMatchIds(t, '   ', false, false)).toEqual([]);
  });

  it('case-insensitive substring match by default', () => {
    const t = tree(['Hello World', 'goodbye', 'HELLO again']);
    expect(computeSearchMatchIds(t, 'hello', false, false)).toEqual([1, 3]);
  });

  it('case-sensitive substring match when matchCase is true', () => {
    const t = tree(['Hello World', 'hello world']);
    expect(computeSearchMatchIds(t, 'Hello', true, false)).toEqual([1]);
  });

  it('whole-word match respects word boundaries', () => {
    const t = tree(['cat', 'concatenate', 'a cat sat']);
    expect(computeSearchMatchIds(t, 'cat', false, true)).toEqual([1, 3]);
  });

  it('whole-word match is case-insensitive unless matchCase is also true', () => {
    const t = tree(['CAT', 'cat']);
    expect(computeSearchMatchIds(t, 'cat', false, true)).toEqual([1, 2]);
    expect(computeSearchMatchIds(t, 'cat', true, true)).toEqual([2]);
  });

  it('escapes regex metacharacters in the query so they are treated as literal characters', () => {
    // If '.' weren't escaped it would match ANY character as a regex wildcard — 'aXb' would
    // wrongly match a query of 'a.b'. Escaped, only the literal "a.b" matches.
    const t = tree(['a.b test', 'aXb test']);
    expect(computeSearchMatchIds(t, 'a.b', false, true)).toEqual([1]);
  });

  it('treats a missing/undefined text field as an empty string, never throws', () => {
    const t: TestNode[] = [{ id: 1, depth: 0 }, { id: 2, depth: 0, text: 'hello' }];
    expect(() => computeSearchMatchIds(t, 'hello', false, false)).not.toThrow();
    expect(computeSearchMatchIds(t, 'hello', false, false)).toEqual([2]);
  });

  it('returns [] when nothing matches', () => {
    const t = tree(['foo', 'bar']);
    expect(computeSearchMatchIds(t, 'zzz', false, false)).toEqual([]);
  });

  it.each([
    [tree(['Apple pie', 'apple', 'APPLE sauce', 'banana']), 'apple', false, false],
    [tree(['Apple pie', 'apple', 'APPLE sauce', 'banana']), 'apple', true, false],
    [tree(['a cat', 'category', 'CAT scan']), 'cat', false, true],
    [tree(['a cat', 'category', 'CAT scan']), 'cat', true, true],
    [tree([]), 'anything', false, false]
  ])('matches the oracle across representative cases', (t, query, matchCase, wholeWord) => {
    expect(computeSearchMatchIds(t as TestNode[], query as string, matchCase as boolean, wholeWord as boolean)).toEqual(
      oComputeSearchMatchIds(t as TestNode[], query as string, matchCase as boolean, wholeWord as boolean)
    );
  });
});

describe('resolveSearchIndex', () => {
  it('returns -1 when there are no matches, regardless of current index', () => {
    expect(resolveSearchIndex(0, 0)).toBe(-1);
    expect(resolveSearchIndex(5, 0)).toBe(-1);
    expect(resolveSearchIndex(-1, 0)).toBe(-1);
  });

  it('resets to 0 when the current index is negative but there are matches', () => {
    expect(resolveSearchIndex(-1, 3)).toBe(0);
  });

  it('resets to 0 when the current index is out of range for the new match count', () => {
    expect(resolveSearchIndex(5, 3)).toBe(0);
  });

  it('keeps the current index unchanged when still in range', () => {
    expect(resolveSearchIndex(1, 3)).toBe(1);
    expect(resolveSearchIndex(0, 1)).toBe(0);
  });

  it('keeps the current index when it exactly equals the last valid index', () => {
    expect(resolveSearchIndex(2, 3)).toBe(2);
  });
});
