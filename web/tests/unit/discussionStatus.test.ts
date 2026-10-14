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
  openCountLabel,
  documentProgress, attentionParts, progressSummaryText,
  remarkKind, remarkQuestionState, remarkIsOpenQuestion, discussionItemIsOpen, applyRemarkKind, migrateQaToRemarks
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
  it('accepts only the three filters', () => {
    expect(normalizeDiscussionFilter('openQa')).toBe('openQa');
    expect(normalizeDiscussionFilter('openItems')).toBe('openItems');
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
  it('openItems combines open questions, open remarks and Issue/Follow-up rows', () => {
    const nodes = [{ id: 6, marker: 'issue' }, { id: 7, marker: 'followup' }, { id: 8, marker: 'confirmed' }, { id: 9, marker: 'parked' }];
    expect([...nodesWithOpenItems('openItems', qa, remarks, nodes)].sort()).toEqual([1, 2, 6, 7]);
  });
});

describe('openCountLabel', () => {
  it('pluralises', () => {
    expect(openCountLabel(1, 'question')).toBe('1 open question');
    expect(openCountLabel(2, 'follow-up')).toBe('2 open follow-ups');
  });
});

describe('documentProgress / attentionParts / progressSummaryText', () => {
  const nodes = [
    { id: 1, marker: 'issue' }, { id: 2, marker: 'followup' }, { id: 3, marker: 'followup' },
    { id: 4, marker: 'confirmed' }, { id: 5, marker: 'na' }, { id: 6, marker: 'parked' }, { id: 7 }
  ];
  const qa = [
    { sourceNodeId: 7, question: 'Who signs off?' },
    { sourceNodeId: 7, question: 'Which carrier?', answer: 'DHL' },
    { sourceNodeId: 7, question: 'Budget?', wontAnswer: true },
    { sourceNodeId: 7, type: 'section', question: 'Heading' },
    { sourceNodeId: 99, question: 'Elsewhere' }
  ];
  const remarks = [
    { anchorNodeId: 1, text: 'Check rates', followUp: true },
    { anchorNodeId: 1, text: 'Done', followUp: true, resolvedAt: 1 },
    { anchorNodeId: 1, text: 'Just a note' },
    { anchorNodeId: 1, text: '', followUp: true }
  ];

  it('counts what needs attention, parked and settled', () => {
    expect(documentProgress(nodes, qa, remarks)).toEqual({ issues: 1, followups: 2, parked: 1, questions: 1, remarks: 1, settled: 5, total: 11 });
  });

  it('lists only kinds with something open, most urgent first', () => {
    expect(attentionParts(documentProgress(nodes, qa, remarks)).map((a) => a.label)).toEqual(['1 issue', '2 follow-ups', '1 question', '1 remark']);
    expect(attentionParts(documentProgress([{ id: 1, marker: 'confirmed' }], [], []))).toEqual([]);
  });

  it('describes the summary in words', () => {
    expect(progressSummaryText(documentProgress(nodes, qa, remarks))).toBe(
      'Needs attention: 1 issue, 2 follow-ups, 1 open question, 1 open follow-up remark. 5 of 11 settled, 1 parked.'
    );
    expect(progressSummaryText(documentProgress([{ id: 1, marker: 'confirmed' }], [], []))).toBe('Nothing needs attention. 1 of 1 settled.');
  });
});

describe('discussion items (Q&A and remarks as one object)', () => {
  it('reads the kind from the stored fields, old remarks included', () => {
    expect(remarkKind({ text: 'x' })).toBe('comment');
    expect(remarkKind({ text: 'x', followUp: true })).toBe('followup');
    expect(remarkKind({ text: 'x', kind: 'question' })).toBe('question');
    expect(remarkKind({ text: 'x', kind: 'decision', followUp: true })).toBe('decision');
  });
  it('a question is answered by Yes/No or by answer text, and can be closed', () => {
    expect(remarkQuestionState({ kind: 'question', text: 'Enough?' })).toBe('open');
    expect(remarkQuestionState({ kind: 'question', text: 'Enough?', verdict: 'no' })).toBe('answered');
    expect(remarkQuestionState({ kind: 'question', text: 'Enough?', answer: '<b>Yes</b>' })).toBe('answered');
    expect(remarkQuestionState({ kind: 'question', text: 'Enough?', wontAnswer: true })).toBe('wont');
    expect(remarkIsOpenQuestion({ kind: 'question', text: '' })).toBe(false);
    expect(discussionItemIsOpen({ kind: 'question', text: 'Enough?' })).toBe(true);
    expect(discussionItemIsOpen({ text: 'x', followUp: true, resolvedAt: 5 })).toBe(false);
  });
  it('only follow-ups carry a follow-up state', () => {
    expect(remarkState({ text: 'x', kind: 'question', followUp: true })).toBe('comment');
    expect(remarkIsOpen({ text: 'x', kind: 'decision', followUp: true })).toBe(false);
  });
  it('changing the kind clears the other kinds\' fields', () => {
    expect(applyRemarkKind({ text: 'x', followUp: true, resolvedAt: 3 }, 'question')).toEqual({ text: 'x', kind: 'question' });
    expect(applyRemarkKind({ text: 'x', kind: 'question' as const }, 'followup')).toEqual({ text: 'x', followUp: true });
    expect(applyRemarkKind({ text: 'x', kind: 'decision' as const }, 'comment')).toEqual({ text: 'x' });
  });
  it('counts open question items with the open questions', () => {
    const remarks = [
      { anchorNodeId: 1, kind: 'question' as const, text: 'Enough?' },
      { anchorNodeId: 1, kind: 'question' as const, text: 'Block?', verdict: 'yes' as const },
      { anchorNodeId: 2, text: 'Send list', followUp: true }
    ];
    expect(countOpenItems([], remarks, new Set([1, 2]))).toEqual({ openQuestions: 1, openRemarks: 1 });
    expect([...nodesWithOpenItems('openQa', [], remarks)]).toEqual([1]);
    const p = documentProgress([{ id: 1 }, { id: 2 }], [], remarks);
    expect([p.questions, p.remarks, p.settled]).toEqual([1, 1, 1]);
  });
  it('moves linked Q&A into question items once, keeping sections and unlinked entries', () => {
    const qa = [
      { id: 'qa1', question: 'Enough?', answer: 'Yes', sourceNodeId: 4, createdAt: new Date(2026, 9, 14, 10).getTime() },
      { id: 'qa2', question: 'Later?', answer: '', sourceNodeId: 4, wontAnswer: true },
      { id: 'qa3', type: 'section', question: '', sourceNodeId: null },
      { id: 'qa4', question: 'Loose', sourceNodeId: null }
    ];
    const first = migrateQaToRemarks(qa, [{ id: 'r1', text: 'Hi', anchorNodeId: 4 }]);
    expect(first.moved).toBe(2);
    expect(first.qaItems.map((q) => q.id)).toEqual(['qa3', 'qa4']);
    expect(first.remarks.slice(1)).toEqual([
      { id: 'rqa1', kind: 'question', person: '', text: 'Enough?', answer: 'Yes', date: '2026-10-14', context: '', anchorNodeId: 4, createdAt: qa[0].createdAt },
      { id: 'rqa2', kind: 'question', person: '', text: 'Later?', answer: '', date: '', context: '', anchorNodeId: 4, createdAt: 0, wontAnswer: true }
    ]);
    // Running it again (the same entries still in qaItems) adds nothing twice.
    const again = migrateQaToRemarks(qa, first.remarks);
    expect(again.remarks.length).toBe(first.remarks.length);
  });
});
