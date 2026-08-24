import { describe, it, expect } from 'vitest';
import { getBacklinkRefs, getBacklinksTo, cleanupBacklinksFor, renameBacklinksFor, findNodeByText, formatBacklinkPreview } from './backlinks';

describe('getBacklinkRefs', () => {
  it('returns empty for text with no references', () => {
    expect(getBacklinkRefs('plain text')).toEqual([]);
    expect(getBacklinkRefs('')).toEqual([]);
    expect(getBacklinkRefs(null)).toEqual([]);
    expect(getBacklinkRefs(undefined)).toEqual([]);
  });

  it('extracts a single reference', () => {
    expect(getBacklinkRefs('see [[Project Kickoff]] for details')).toEqual(['Project Kickoff']);
  });

  it('extracts multiple references in order', () => {
    expect(getBacklinkRefs('[[A]] and [[B]] and [[C]]')).toEqual(['A', 'B', 'C']);
  });

  it('does not misread [[[triple]]] brackets as a valid reference', () => {
    // The (?!\]) lookahead means a ]]] run doesn't close early on the first ]].
    expect(getBacklinkRefs('[[[triple]]]')).toEqual(['[triple]']);
  });
});

describe('getBacklinksTo', () => {
  const nodes = [
    { id: 1, text: 'Project Kickoff' },
    { id: 2, text: 'See [[Project Kickoff]] for context' },
    { id: 3, text: 'Unrelated node' },
    { id: 4, text: 'Also references [[project kickoff]] (case-insensitive)' }
  ];

  it('finds all nodes referencing the target, case-insensitively', () => {
    expect(getBacklinksTo(nodes, 1).sort()).toEqual([2, 4]);
  });

  it('returns empty array for a node with no referrers', () => {
    expect(getBacklinksTo(nodes, 3)).toEqual([]);
  });

  it('returns empty array for a nonexistent target id', () => {
    expect(getBacklinksTo(nodes, 999)).toEqual([]);
  });

  it('returns empty array when the target node has blank text', () => {
    const withBlank = [...nodes, { id: 5, text: '' }];
    expect(getBacklinksTo(withBlank, 5)).toEqual([]);
  });

  it('never includes the target node itself', () => {
    const selfRef = [{ id: 1, text: 'References [[Self Ref]]' }, { id: 2, text: 'Self Ref' }];
    // node 1's own text doesn't match node 1, only node 2 is the real target here
    expect(getBacklinksTo(selfRef, 1)).toEqual([]);
  });
});

describe('cleanupBacklinksFor', () => {
  it('strips a reference to a deleted node entirely, not just its brackets', () => {
    const nodes = [{ id: 1, text: 'See [[Old Node]] for details' }];
    const result = cleanupBacklinksFor(nodes, ['Old Node']);
    expect(result[0].text).toBe('See for details');
  });

  it('leaves unrelated references untouched', () => {
    const nodes = [{ id: 1, text: 'See [[Kept]] and [[Removed]]' }];
    const result = cleanupBacklinksFor(nodes, ['Removed']);
    expect(result[0].text).toBe('See [[Kept]] and');
  });

  it('is case-insensitive', () => {
    const nodes = [{ id: 1, text: 'See [[Old Node]]' }];
    const result = cleanupBacklinksFor(nodes, ['old node']);
    expect(result[0].text).toBe('See');
  });

  it('returns the same node object when nothing changes (no [[ at all)', () => {
    const nodes = [{ id: 1, text: 'no references here' }];
    const result = cleanupBacklinksFor(nodes, ['Old Node']);
    expect(result[0]).toBe(nodes[0]);
  });

  it('does not mutate the input array', () => {
    const nodes = [{ id: 1, text: 'See [[Old Node]]' }];
    cleanupBacklinksFor(nodes, ['Old Node']);
    expect(nodes[0].text).toBe('See [[Old Node]]');
  });
});

describe('renameBacklinksFor', () => {
  it('rewrites matching references to the new text', () => {
    const nodes = [{ id: 1, text: 'See [[Old Name]] here' }];
    const result = renameBacklinksFor(nodes, 'Old Name', 'New Name');
    expect(result[0].text).toBe('See [[New Name]] here');
  });

  it('leaves non-matching references untouched', () => {
    const nodes = [{ id: 1, text: 'See [[Other]] here' }];
    const result = renameBacklinksFor(nodes, 'Old Name', 'New Name');
    expect(result[0].text).toBe('See [[Other]] here');
  });

  it('is a no-op for a case-only change', () => {
    const nodes = [{ id: 1, text: 'See [[old name]] here' }];
    const result = renameBacklinksFor(nodes, 'old name', 'Old Name');
    expect(result).toBe(nodes);
  });

  it('is a no-op when oldText is blank', () => {
    const nodes = [{ id: 1, text: 'See [[Something]]' }];
    const result = renameBacklinksFor(nodes, '', 'New Name');
    expect(result).toBe(nodes);
  });

  it('returns the same array reference when nothing actually referenced the old text', () => {
    const nodes = [{ id: 1, text: 'no references here' }];
    const result = renameBacklinksFor(nodes, 'Old Name', 'New Name');
    expect(result).toBe(nodes);
  });
});

describe('formatBacklinkPreview', () => {
  it('splits plain text into a single non-mention segment', () => {
    expect(formatBacklinkPreview('plain text')).toEqual([{ text: 'plain text', mention: false }]);
  });

  it('splits a single mention into plain/mention/plain segments', () => {
    expect(formatBacklinkPreview('see [[Target]] here')).toEqual([
      { text: 'see ', mention: false },
      { text: '[[Target]]', mention: true },
      { text: ' here', mention: false }
    ]);
  });

  it('handles multiple mentions in one string', () => {
    expect(formatBacklinkPreview('[[A]] and [[B]]')).toEqual([
      { text: '[[A]]', mention: true },
      { text: ' and ', mention: false },
      { text: '[[B]]', mention: true }
    ]);
  });

  it('truncates to 80 chars by default, matching legacy exactly', () => {
    const long = 'x'.repeat(100);
    const result = formatBacklinkPreview(long);
    expect(result).toHaveLength(1);
    expect(result[0].text).toHaveLength(80);
  });

  it('truncates BEFORE splitting, so a mention straddling the cutoff is left as unclosed plain text', () => {
    // 75 chars of "x" then "[[Target]]" starting at index 75 -- the closing "]]" lands past
    // the 80-char cutoff, so the truncated string never contains a complete [[...]] pair.
    const text = 'x'.repeat(75) + '[[Target]]';
    const result = formatBacklinkPreview(text);
    expect(result.every((seg) => !seg.mention)).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(formatBacklinkPreview('')).toEqual([]);
  });
});

describe('findNodeByText', () => {
  const nodes = [
    { id: 1, text: 'Project Kickoff' },
    { id: 2, text: '[Section] Onboarding' },
    { id: 3, text: 'Unrelated node' }
  ];

  it('finds an exact case-insensitive match', () => {
    expect(findNodeByText(nodes, 'project kickoff')?.id).toBe(1);
  });

  it('matches through stripSemanticMarkers when the node text carries a marker (marker unwrapped, content kept)', () => {
    // stripSemanticMarkers UNWRAPS a [marker], it doesn't delete it -- "[Section] Onboarding"
    // strips to "Section Onboarding", not just "Onboarding".
    expect(findNodeByText(nodes, 'Section Onboarding')?.id).toBe(2);
  });

  it('returns null when nothing matches', () => {
    expect(findNodeByText(nodes, 'Nonexistent')).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(findNodeByText(nodes, '')).toBeNull();
  });
});
