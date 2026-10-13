import { describe, it, expect } from 'vitest';
import {
  htmlHasVisibleText,
  qaState,
  remarkIsOpen,
  remarkIsFollowUp,
  remarkState,
  isCountableQuestion,
  countOpenItems,
  normalizeDiscussionFilter,
  nodesWithOpenItems,
  openItemsByNode,
  openCountLabel,
} from '../../src/utils/discussionStatus';

describe('htmlHasVisibleText', () => {
  it('ignores tags, nbsp and whitespace', () => {
    expect(htmlHasVisibleText('')).toBe(false);
    expect(htmlHasVisibleText(undefined)).toBe(false);
    expect(htmlHasVisibleText('<div><br></div>')).toBe(false);
    expect(htmlHasVisibleText('&nbsp; <b> </b>')).toBe(false);
    expect(htmlHasVisibleText('<b>yes</b>')).toBe(true);
  });
});

describe('qaState', () => {
  it('is open without an answer', () => {
    expect(qaState({ question: 'Q?', answer: '' })).toBe('open');
    expect(qaState({ question: 'Q?', answer: '<br>' })).toBe('open');
  });
  it('is answered once the answer has text, even if flagged won\'t answer', () => {
    expect(qaState({ answer: 'Yes' })).toBe('answered');
    expect(qaState({ answer: 'Yes', wontAnswer: true })).toBe('answered');
  });
  it('is won\'t answer when flagged with no answer', () => {
    expect(qaState({ answer: '', wontAnswer: true })).toBe('wont');
  });
});

describe('remark status', () => {
  it('treats a remark as a plain comment unless it is marked as a follow-up', () => {
    expect(remarkIsOpen({})).toBe(false);
    expect(remarkIsFollowUp({})).toBe(false);
    expect(remarkState({})).toBe('comment');
    expect(remarkState({ resolvedAt: 5 })).toBe('comment');
  });
  it('counts a follow-up as open until it is resolved', () => {
    expect(remarkIsOpen({ followUp: true })).toBe(true);
    expect(remarkIsOpen({ followUp: true, resolvedAt: null })).toBe(true);
    expect(remarkIsOpen({ followUp: true, resolvedAt: 1700000000000 })).toBe(false);
    expect(remarkState({ followUp: true })).toBe('open');
    expect(remarkState({ followUp: true, resolvedAt: 1 })).toBe('resolved');
  });
});

describe('isCountableQuestion', () => {
  it('skips sections and empty questions', () => {
    expect(isCountableQuestion({ type: 'section', question: 'Heading' })).toBe(false);
    expect(isCountableQuestion({ question: '  ' })).toBe(false);
    expect(isCountableQuestion({ question: 'Real?' })).toBe(true);
  });
});

describe('countOpenItems', () => {
  const qa = [
    { question: 'Open?', answer: '', sourceNodeId: 1 },
    { question: 'Answered?', answer: 'yes', sourceNodeId: 1 },
    { question: 'Skipped?', answer: '', wontAnswer: true, sourceNodeId: 2 },
    { question: 'Unlinked?', answer: '', sourceNodeId: null },
    { question: 'Other doc?', answer: '', sourceNodeId: 99 },
    { type: 'section', question: 'Section', sourceNodeId: 1 },
  ];
  const remarks = [
    { anchorNodeId: 1, text: 'Open', followUp: true },
    { anchorNodeId: 1, text: 'Just a comment' },
    { anchorNodeId: 1, text: '<br>', followUp: true },
    { anchorNodeId: 2, text: 'Done', followUp: true, resolvedAt: 5 },
    { anchorNodeId: 99, text: 'Elsewhere', followUp: true },
  ];
  it('counts only open items with text on nodes of the document', () => {
    expect(countOpenItems(qa, remarks, new Set([1, 2]))).toEqual({ openQuestions: 1, openRemarks: 1 });
  });
  it('handles empty input', () => {
    expect(countOpenItems([], [], new Set())).toEqual({ openQuestions: 0, openRemarks: 0 });
  });
});

describe('normalizeDiscussionFilter', () => {
  it('accepts only the two filters', () => {
    expect(normalizeDiscussionFilter('openQa')).toBe('openQa');
    expect(normalizeDiscussionFilter('openRemarks')).toBe('openRemarks');
    expect(normalizeDiscussionFilter('issue')).toBeNull();
    expect(normalizeDiscussionFilter(null)).toBeNull();
  });
});

describe('nodesWithOpenItems', () => {
  const qa = [
    { question: 'A?', answer: '', sourceNodeId: 1 },
    { question: 'B?', answer: 'done', sourceNodeId: 2 },
    { question: 'C?', answer: '', wontAnswer: true, sourceNodeId: 3 },
  ];
  const remarks = [{ anchorNodeId: 2, text: 'x', followUp: true }, { anchorNodeId: 3, text: 'y', followUp: true, resolvedAt: 1 }, { anchorNodeId: 4, text: '', followUp: true }, { anchorNodeId: 5, text: 'comment' }];
  it('finds nodes with open questions', () => {
    expect([...nodesWithOpenItems('openQa', qa, remarks)]).toEqual([1]);
  });
  it('finds nodes with open remarks', () => {
    expect([...nodesWithOpenItems('openRemarks', qa, remarks)]).toEqual([2]);
  });
});

describe('openItemsByNode', () => {
  it('lists nodes in document order with their open items, remarks newest first', () => {
    const qa = [
      { id: 'q1', question: 'Later node?', answer: '', sourceNodeId: 2 },
      { id: 'q2', question: 'Closed', answer: 'x', sourceNodeId: 1 },
    ];
    const remarks = [
      { id: 'r1', anchorNodeId: 1, text: 'a', followUp: true, createdAt: 10 },
      { id: 'r2', anchorNodeId: 1, text: 'b', followUp: true, createdAt: 20 },
      { id: 'r3', anchorNodeId: 1, text: 'c', followUp: true, createdAt: 30, resolvedAt: 40 },
      { id: 'r4', anchorNodeId: 3, text: '', followUp: true, createdAt: 50 },
      { id: 'r5', anchorNodeId: 1, text: 'plain', createdAt: 60 },
    ];
    const out = openItemsByNode([1, 2, 3], qa, remarks);
    expect(out.map(e => e.nodeId)).toEqual([1, 2]);
    expect(out[0].questions).toEqual([]);
    expect(out[0].remarks.map(r => r.id)).toEqual(['r2', 'r1']);
    expect(out[1].questions.map(q => q.id)).toEqual(['q1']);
  });
});

describe('openCountLabel', () => {
  it('pluralises', () => {
    expect(openCountLabel(1, 'question')).toBe('1 open question');
    expect(openCountLabel(2, 'follow-up')).toBe('2 open follow-ups');
  });
});
