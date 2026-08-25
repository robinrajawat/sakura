import { describe, it, expect } from 'vitest';
import { isInlineExpanded } from './inlineExpand';

describe('isInlineExpanded', () => {
  it('when the default is off, a node is expanded only if its id is in the deviation set', () => {
    expect(isInlineExpanded(false, new Set(), 1)).toBe(false);
    expect(isInlineExpanded(false, new Set([1]), 1)).toBe(true);
    expect(isInlineExpanded(false, new Set([2]), 1)).toBe(false);
  });

  it('when the default is on, a node is expanded UNLESS its id is in the deviation set', () => {
    expect(isInlineExpanded(true, new Set(), 1)).toBe(true);
    expect(isInlineExpanded(true, new Set([1]), 1)).toBe(false);
    expect(isInlineExpanded(true, new Set([2]), 1)).toBe(true);
  });

  it('flipping the default instantly flips every node not individually overridden', () => {
    const untouched = new Set<number>();
    expect(isInlineExpanded(false, untouched, 5)).toBe(false);
    expect(isInlineExpanded(true, untouched, 5)).toBe(true);
  });

  it('a node in the deviation set keeps its own state across a default flip', () => {
    const overridden = new Set([5]);
    expect(isInlineExpanded(false, overridden, 5)).toBe(true);
    expect(isInlineExpanded(true, overridden, 5)).toBe(false);
  });
});
