import { describe, it, expect } from 'vitest';
import {
  normalizeThreadStatus, htmlHasVisibleText, qaState, isCountableQuestion,
  normalizeDiscussionFilter, nodesWithOpenItems, openCountLabel,
  documentProgress, attentionParts, progressSummaryText,
  threadEntries, questionState, openQuestions, questionToAnswer, threadStatus, threadStatusEntry,
  markerForThreadStatus, threadStatusForMarker, isThreadMarker, syncedMarker, linkMarkersToThreads,
  migrateDiscussionToThread, needsThreadMigration, migrateQaToRemarks, type ThreadEntry
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

describe('isCountableQuestion', () => {
  it('skips sections and empty questions', () => {
    expect(isCountableQuestion({ type: 'section', question: 'Heading' })).toBe(false);
    expect(isCountableQuestion({ question: '  ' })).toBe(false);
    expect(isCountableQuestion({ question: 'Real?' })).toBe(true);
  });
});

const E = (o: Partial<ThreadEntry>): ThreadEntry => ({ text: 'x', ...o });

describe('one thread', () => {
  const thread = [
    E({ id: 'c', anchorNodeId: 1, createdAt: 1, text: 'Weekend works.' }),
    E({ id: 'q1', anchorNodeId: 1, createdAt: 2, type: 'question', text: 'Enough?' }),
    E({ id: 'q2', anchorNodeId: 1, createdAt: 3, type: 'question', text: 'EU too?' }),
    E({ id: 'a2', anchorNodeId: 1, createdAt: 4, answerTo: 'q2', verdict: 'yes', text: '' })
  ];
  it('orders a node\'s entries by time, stably', () => {
    const mixed = [E({ id: 'b', anchorNodeId: 1, createdAt: 5 }), E({ id: 'x', anchorNodeId: 2, createdAt: 1 }), E({ id: 'a', anchorNodeId: 1, createdAt: 1 }), E({ id: 'c', anchorNodeId: 1, createdAt: 5 })];
    expect(threadEntries(mixed, 1).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('a question is answered by an answer to it (Yes/No or text), else open or won\'t answer', () => {
    expect(questionState(thread[1], thread)).toBe('open');
    expect(questionState(thread[2], thread)).toBe('answered');
    expect(questionState(E({ id: 'q3', type: 'question', wontAnswer: true }), thread)).toBe('wont');
    // A blank answer doesn't count.
    expect(questionState(thread[1], [...thread, E({ answerTo: 'q1', text: '<br>' })])).toBe('open');
    expect(questionState(thread[1], [...thread, E({ answerTo: 'q1', text: 'Probably' })])).toBe('answered');
  });
  it('lists open questions and picks the latest open one before a point to answer', () => {
    expect(openQuestions(thread).map((e) => e.id)).toEqual(['q1']);
    expect(questionToAnswer(thread)?.id).toBe('q1');
    expect(questionToAnswer(thread, thread[1])).toBeNull();
    expect(openQuestions([E({ type: 'question', text: '' })])).toEqual([]);
  });
  it('the thread status is the latest status chip', () => {
    expect(threadStatus(thread)).toBeNull();
    const t = [E({ status: 'followup' }), E({}), E({ status: 'parked' }), E({})];
    expect(threadStatus(t)).toBe('parked');
    // Older Resolved / Decision read as Confirmed.
    expect(threadStatus([E({ status: 'decision' })])).toBe('confirmed');
    expect(threadStatusEntry(t)).toBe(t[2]);
  });
});

describe('row marker ⇄ thread status', () => {
  it('three markers, each a thread status of the same name; older statuses map onto them', () => {
    for (const m of ['confirmed', 'followup', 'parked']) {
      expect(markerForThreadStatus(m)).toBe(m);
      expect(threadStatusForMarker(m)).toBe(m);
      expect(isThreadMarker(m)).toBe(true);
    }
    expect(markerForThreadStatus('resolved')).toBe('confirmed');
    expect(markerForThreadStatus('decision')).toBe('confirmed');
    expect(markerForThreadStatus('issue')).toBe('followup');
    expect(markerForThreadStatus('na')).toBe('parked');
    expect(threadStatusForMarker('issue')).toBe('followup');
    expect(markerForThreadStatus(null)).toBeNull();
    expect(isThreadMarker('')).toBe(false);
    expect(normalizeThreadStatus('bogus')).toBeNull();
  });
  it('syncs the marker from the thread', () => {
    expect(syncedMarker('', [E({ status: 'followup' })])).toBe('followup');
    expect(syncedMarker('followup', [E({ status: 'resolved' })])).toBe('confirmed');
    expect(syncedMarker('', [E({ status: 'issue' })])).toBe('followup');
    expect(syncedMarker('', [E({ status: 'na' })])).toBe('parked');
    expect(syncedMarker('followup', [E({})])).toBe('');
    expect(syncedMarker('parked', [E({})])).toBe('');
  });
  it('links older documents once: thread status → marker, marker → status on the latest entry', () => {
    const nodes = [{ id: 1 }, { id: 2, marker: 'followup' }, { id: 3, marker: 'issue' }, { id: 4, marker: 'confirmed' }, { id: 5, marker: 'issue' }, { id: 6, marker: 'parked' }];
    const entries = [
      E({ anchorNodeId: 1, createdAt: 1, status: 'decision' }),
      E({ anchorNodeId: 2, createdAt: 1 }), E({ anchorNodeId: 2, createdAt: 2 }),
      E({ anchorNodeId: 3, createdAt: 1, status: 'followup' }),
      E({ anchorNodeId: 5, createdAt: 1, status: 'resolved' }), E({ anchorNodeId: 5, createdAt: 2 }),
      E({ anchorNodeId: 6, createdAt: 1, status: 'decision' })
    ];
    const changes = linkMarkersToThreads(nodes, entries);
    // Row 3's old Issue mark already agrees with its thread's Follow-up; row 5's goes on its latest
    // entry as Follow-up; row 6 keeps showing Out of scope (once row-only): it joins the thread after
    // the decision.
    expect([...changes]).toEqual([[1, 'confirmed']]);
    expect(entries.map((e) => e.status || null)).toEqual(['decision', null, 'followup', 'followup', 'resolved', 'followup', 'decision', 'parked']);
    expect(entries[7]).toMatchObject({ anchorNodeId: 6, person: '', text: '', createdAt: 2 });
    // An N/A row whose thread has no status puts Out of scope on the latest entry.
    const quiet = [E({ anchorNodeId: 7, createdAt: 1 })];
    linkMarkersToThreads([{ id: 7, marker: 'na' }], quiet);
    expect(quiet[0].status).toBe('parked');
  });
});

describe('migrateDiscussionToThread', () => {
  it('turns follow-ups, decisions and inline answers into chips and answer entries, once', () => {
    const old = [
      E({ id: 'f', anchorNodeId: 1, followUp: true, createdAt: 1 }),
      E({ id: 'g', anchorNodeId: 1, followUp: true, resolvedAt: 9, createdAt: 2 }),
      E({ id: 'd', anchorNodeId: 1, kind: 'decision', createdAt: 3 }),
      E({ id: 'q', anchorNodeId: 1, kind: 'question', text: 'Enough?', answer: 'Ops agreed', verdict: 'yes', date: '2026-10-14', createdAt: 4 }),
      E({ id: 'w', anchorNodeId: 1, kind: 'question', text: 'Later?', answer: '', wontAnswer: true, createdAt: 6 }),
      E({ id: 'c', anchorNodeId: 1, createdAt: 7 })
    ];
    const { entries, changed } = migrateDiscussionToThread(old);
    expect(changed).toBe(true);
    expect(entries.map((e) => [e.id, e.type || '', e.status || '', e.answerTo || '', e.verdict || ''])).toEqual([
      ['f', '', 'followup', '', ''], ['g', '', 'confirmed', '', ''], ['d', '', 'confirmed', '', ''],
      ['q', 'question', '', '', ''], ['q-a', '', '', 'q', 'yes'], ['w', 'question', '', '', ''], ['c', '', '', '', '']
    ]);
    expect(entries[4]).toMatchObject({ text: 'Ops agreed', person: '', createdAt: 5, date: '2026-10-14' });
    expect(entries[5].wontAnswer).toBe(true);
    expect(needsThreadMigration(entries)).toBe(false);
    expect(migrateDiscussionToThread(entries)).toEqual({ entries, changed: false });
    expect(old[0].followUp).toBe(true); // the input is not mutated
    expect(entries[2].decision).toBe(true); // an old decision is Agreed with a Decision chip
    // Older statuses map onto the three: Resolved → Agreed, Decision → Agreed + chip, Issue →
    // Follow-up, N/A → Out of scope.
    const saved = migrateDiscussionToThread([E({ id: 'r', status: 'resolved' }), E({ id: 'd', status: 'decision' }), E({ id: 'i', status: 'issue' }), E({ id: 'n', status: 'na' }), E({ id: 'p', status: 'parked' })]);
    expect(saved.changed).toBe(true);
    expect(saved.entries.map((e) => e.status)).toEqual(['confirmed', 'confirmed', 'followup', 'parked', 'parked']);
    expect(saved.entries.map((e) => !!e.decision)).toEqual([false, true, false, false, false]);
  });
});

describe('Q&A migration', () => {
  it('moves linked Q&A into the row\'s thread once, keeping sections and unlinked entries', () => {
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
      { id: 'rqa1', type: 'question', person: '', text: 'Enough?', date: '2026-10-14', context: '', anchorNodeId: 4, createdAt: qa[0].createdAt },
      { id: 'rqa1-a', person: '', text: 'Yes', date: '2026-10-14', context: '', anchorNodeId: 4, createdAt: (qa[0].createdAt as number) + 1, answerTo: 'rqa1' },
      { id: 'rqa2', type: 'question', person: '', text: 'Later?', date: '', context: '', anchorNodeId: 4, createdAt: 0, wontAnswer: true }
    ]);
    const again = migrateQaToRemarks(qa, first.remarks);
    expect(again.remarks.length).toBe(first.remarks.length);
  });
});

describe('normalizeDiscussionFilter', () => {
  it('accepts the two filters', () => {
    expect(normalizeDiscussionFilter('openQa')).toBe('openQa');
    expect(normalizeDiscussionFilter('openItems')).toBe('openItems');
    expect(normalizeDiscussionFilter('openRemarks')).toBeNull();
    expect(normalizeDiscussionFilter(null)).toBeNull();
  });
});

describe('nodesWithOpenItems', () => {
  const entries = [
    E({ id: 'a', anchorNodeId: 1, type: 'question', text: 'A?' }),
    E({ id: 'b', anchorNodeId: 2, type: 'question', text: 'B?' }), E({ anchorNodeId: 2, answerTo: 'b', verdict: 'no' }),
    E({ id: 'c', anchorNodeId: 3, type: 'question', text: 'C?', wontAnswer: true })
  ];
  it('finds nodes with open questions; openItems adds Follow-up rows (older Issue too)', () => {
    expect([...nodesWithOpenItems('openQa', entries)]).toEqual([1]);
    const nodes = [{ id: 6, marker: 'issue' }, { id: 7, marker: 'followup' }, { id: 8, marker: 'confirmed' }];
    expect([...nodesWithOpenItems('openItems', entries, nodes)].sort()).toEqual([1, 6, 7]);
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
    { sourceNodeId: 7, type: 'section', question: 'Heading' },
    { sourceNodeId: 99, question: 'Elsewhere' }
  ];
  const entries = [
    E({ id: 'q', anchorNodeId: 1, type: 'question', text: 'Rates?' }),
    E({ id: 'p', anchorNodeId: 1, type: 'question', text: 'Budget?', wontAnswer: true }),
    E({ anchorNodeId: 1, text: 'Follow-up chips are counted by the marker', status: 'followup' }),
    E({ id: 'z', anchorNodeId: 99, type: 'question', text: 'Other doc?' })
  ];

  it('counts what needs attention, out of scope and settled (older Issue / N/A included)', () => {
    expect(documentProgress(nodes, qa, entries)).toEqual({ followups: 3, parked: 2, questions: 2, settled: 3, total: 8 });
  });
  it('lists only kinds with something open, most urgent first', () => {
    expect(attentionParts(documentProgress(nodes, qa, entries)).map((a) => a.label)).toEqual(['3 follow-ups', '2 questions']);
    expect(attentionParts(documentProgress([{ id: 1, marker: 'confirmed' }], [], []))).toEqual([]);
  });
  it('describes the summary in words', () => {
    expect(progressSummaryText(documentProgress(nodes, qa, entries))).toBe('Needs attention: 3 follow-ups, 2 open questions.');
    expect(progressSummaryText(documentProgress([{ id: 1, marker: 'confirmed' }], [], []))).toBe('Nothing needs attention.');
  });
});
