import { describe, it, expect } from 'vitest';
import { decisionIsOpen, decisionVisibleItems } from './decisionFilter';
import type { Decision } from '../store/padStore';

const decision = (overrides: Partial<Decision> = {}): Decision => ({
  id: 'dl1',
  anchorNodeId: null,
  context: '',
  decision: 'Use React',
  rationale: '',
  alternatives: '',
  impact: '',
  status: 'proposed',
  author: '',
  timestamp: 0,
  createdAt: 0,
  modifiedAt: 0,
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
    decision({ id: 'dl1', status: 'proposed' }),
    decision({ id: 'dl2', status: 'approved' }),
    decision({ id: 'dl3', status: 'rejected' }),
    decision({ id: 'dl4', status: 'proposed' })
  ];

  it('returns all items when openOnly is false', () => {
    expect(decisionVisibleItems(items, false)).toHaveLength(4);
  });

  it('filters to only proposed items when openOnly is true', () => {
    const result = decisionVisibleItems(items, true);
    expect(result.map((d) => d.id)).toEqual(['dl1', 'dl4']);
  });
});
