import { describe, it, expect } from 'vitest';
import { decisionIsOpen, decisionVisibleItems } from './decisionFilter';
import type { Decision } from '../store/padStore';

const decision = (overrides: Partial<Decision> = {}): Decision => ({
  id: 1,
  title: 'Use React',
  description: 'Chosen for the rewrite',
  status: 'proposed',
  ...overrides
});

describe('decisionIsOpen', () => {
  it('is true for proposed', () => {
    expect(decisionIsOpen(decision({ status: 'proposed' }))).toBe(true);
  });

  it('is false for approved', () => {
    expect(decisionIsOpen(decision({ status: 'approved' }))).toBe(false);
  });

  it('is false for rejected', () => {
    expect(decisionIsOpen(decision({ status: 'rejected' }))).toBe(false);
  });
});

describe('decisionVisibleItems', () => {
  const items: Decision[] = [
    decision({ id: 1, status: 'proposed' }),
    decision({ id: 2, status: 'approved' }),
    decision({ id: 3, status: 'rejected' }),
    decision({ id: 4, status: 'proposed' })
  ];

  it('returns all items when openOnly is false', () => {
    expect(decisionVisibleItems(items, false)).toHaveLength(4);
  });

  it('filters to only proposed items when openOnly is true', () => {
    const result = decisionVisibleItems(items, true);
    expect(result.map((d) => d.id)).toEqual([1, 4]);
  });
});
