import { describe, it, expect } from 'vitest';
import { findIdsMissingFromCloud } from '../../src/state/syncReconcile';

describe('findIdsMissingFromCloud', () => {
  it('returns local ids that are not in the cloud set', () => {
    expect(findIdsMissingFromCloud(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });

  it('returns an empty array when every local id is present in the cloud', () => {
    expect(findIdsMissingFromCloud(['a', 'b'], new Set(['a', 'b']))).toEqual([]);
  });

  it('returns all local ids when the cloud set is empty', () => {
    expect(findIdsMissingFromCloud(['a', 'b'], new Set())).toEqual(['a', 'b']);
  });

  it('returns an empty array when there are no local ids', () => {
    expect(findIdsMissingFromCloud([], new Set(['a']))).toEqual([]);
  });

  it('preserves the original order of localIds', () => {
    expect(findIdsMissingFromCloud(['c', 'a', 'b'], new Set(['a']))).toEqual(['c', 'b']);
  });

  it('does not deduplicate — a repeated local id missing from the cloud is returned twice, matching the original loop\'s own plain iteration', () => {
    expect(findIdsMissingFromCloud(['a', 'a', 'b'], new Set(['b']))).toEqual(['a', 'a']);
  });

  it('ignores extra ids in the cloud set that have no local counterpart', () => {
    expect(findIdsMissingFromCloud(['a'], new Set(['a', 'z', 'y']))).toEqual([]);
  });
});
