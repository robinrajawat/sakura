import { describe, it, expect } from 'vitest';
import { qaMatchesSearch, qaIsUnanswered, qaVisibleItems } from './qaFilter';
import type { QaItem } from '../store/padStore';

const item = (overrides: Partial<QaItem> = {}): QaItem => ({
  id: 1,
  question: 'What is the deploy cadence?',
  answer: 'Weekly on Thursdays',
  ...overrides
});

describe('qaMatchesSearch', () => {
  it('matches everything for an empty query', () => {
    expect(qaMatchesSearch(item(), '')).toBe(true);
    expect(qaMatchesSearch(item(), '   ')).toBe(true);
  });

  it('matches against the question', () => {
    expect(qaMatchesSearch(item(), 'deploy')).toBe(true);
  });

  it('matches against the answer', () => {
    expect(qaMatchesSearch(item(), 'thursday')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(qaMatchesSearch(item(), 'DEPLOY')).toBe(true);
  });

  it('returns false when neither question nor answer matches', () => {
    expect(qaMatchesSearch(item(), 'nonexistent')).toBe(false);
  });

  it('handles a missing answer without throwing', () => {
    expect(qaMatchesSearch(item({ answer: '' }), 'deploy')).toBe(true);
  });
});

describe('qaIsUnanswered', () => {
  it('is true for an empty answer', () => {
    expect(qaIsUnanswered(item({ answer: '' }))).toBe(true);
  });

  it('is true for a whitespace-only answer', () => {
    expect(qaIsUnanswered(item({ answer: '   ' }))).toBe(true);
  });

  it('is false when there is a real answer', () => {
    expect(qaIsUnanswered(item({ answer: 'yes' }))).toBe(false);
  });
});

describe('qaVisibleItems', () => {
  const items: QaItem[] = [
    item({ id: 1, question: 'Deploy cadence?', answer: 'Weekly' }),
    item({ id: 2, question: 'Rollback plan?', answer: '' }),
    item({ id: 3, question: 'On-call rotation?', answer: 'Ask the lead' })
  ];

  it('returns all items with no filter/search active', () => {
    expect(qaVisibleItems(items, '', false)).toHaveLength(3);
  });

  it('filters to unanswered only', () => {
    const result = qaVisibleItems(items, '', true);
    expect(result.map((i) => i.id)).toEqual([2]);
  });

  it('filters by search query', () => {
    const result = qaVisibleItems(items, 'rollback', false);
    expect(result.map((i) => i.id)).toEqual([2]);
  });

  it('combines search and unanswered filter (AND, not OR)', () => {
    expect(qaVisibleItems(items, 'deploy', true)).toHaveLength(0);
    expect(qaVisibleItems(items, 'rollback', true)).toHaveLength(1);
  });
});
