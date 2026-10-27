import { describe, it, expect } from 'vitest';
import {
  migrateThreadSimplify,
  threadReadingOrder, threadReplyParent,
  openItemAge, normalizeThreadStatus, htmlHasVisibleText, qaState, isCountableQuestion,
  normalizeDiscussionFilter, nodesWithOpenItems, openCountLabel,
  documentProgress, attentionParts, progressSummaryText,
  threadEntries, questionState, openQuestions, questionToAnswer, isFollowupRow,
  migrateStatusToRows, needsStatusMigration, migrateDiscussionToThread, needsThreadMigration, migrateQaToRemarks, type ThreadEntry
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
    E({ id: 'a2', anchorNodeId: 1, createdAt: 4, answerTo: 'q2', text: 'Yes' })
  ];
  it('orders a node\'s entries by time, stably', () => {
    const mixed = [E({ id: 'b', anchorNodeId: 1, createdAt: 5 }), E({ id: 'x', anchorNodeId: 2, createdAt: 1 }), E({ id: 'a', anchorNodeId: 1, createdAt: 1 }), E({ id: 'c', anchorNodeId: 1, createdAt: 5 })];
    expect(threadEntries(mixed, 1).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('a question is answered by a reply with text, else open (owner, 2026-10-27: nothing else)', () => {
    expect(questionState(thread[1], thread)).toBe('open');
    expect(questionState(thread[2], thread)).toBe('answered');
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
});

describe('row status (owner decision 2026-10-27: one status, on the row)', () => {
  it('three statuses; older values map onto them', () => {
    expect(normalizeThreadStatus('resolved')).toBe('confirmed');
    expect(normalizeThreadStatus('decision')).toBe('confirmed');
    expect(normalizeThreadStatus('issue')).toBe('followup');
    expect(normalizeThreadStatus('na')).toBe('parked');
    expect(normalizeThreadStatus('bogus')).toBeNull();
    expect(isFollowupRow({ id: 1, marker: 'issue' })).toBe(true);
    expect(isFollowupRow({ id: 1, marker: 'confirmed' })).toBe(false);
  });
  it('moves the status a thread showed onto its row, with who, when and owner', () => {
    const nodes = [{ id: 1 }, { id: 2, marker: 'followup' }, { id: 3, marker: 'confirmed' }, { id: 4, marker: 'parked' }];
    const entries = [
      // Row 1: two open follow-ups; the latest one is the row's (with its owner).
      E({ id: 'a', anchorNodeId: 1, createdAt: 1, person: 'Ana', text: 'Ask SAP', status: 'followup', owner: 'Ben' }),
      E({ id: 'b', anchorNodeId: 1, createdAt: 2, person: 'Ken', text: '', status: 'followup', owner: 'Kim' }),
      // Row 2: the follow-up was done, so the earlier Agreed is the status.
      E({ id: 'c', anchorNodeId: 2, createdAt: 1, person: 'Ana', text: '', status: 'confirmed' }),
      E({ id: 'd', anchorNodeId: 2, createdAt: 2, person: 'Ben', text: 'Check rates', status: 'followup', done: true, doneAt: 5 }),
      // Row 3: a later Out of scope settles the follow-up; a decision stays an entry.
      E({ id: 'e', anchorNodeId: 3, createdAt: 1, text: 'Who pays?', status: 'followup' }),
      E({ id: 'f', anchorNodeId: 3, createdAt: 2, person: 'Ana', text: 'Not in this release', status: 'parked', decision: true }),
      // Row 4: no status in its thread, so the row keeps its own.
      E({ id: 'g', anchorNodeId: 4, createdAt: 1, text: 'Note' })
    ];
    expect(needsStatusMigration(entries)).toBe(true);
    const res = migrateStatusToRows(nodes, entries);
    expect([...res.rows]).toEqual([
      [1, { marker: 'followup', markerAt: 2 }],
      [2, { marker: 'confirmed', markerAt: 1 }],
      [3, { marker: 'parked', markerAt: 2 }]
    ]);
    // Status-only entries go; the rest keep their words with no status fields.
    expect(res.entries.map((e) => e.id)).toEqual(['a', 'd', 'e', 'f', 'g']);
    expect(res.entries.some((e) => e.status || e.owner || e.done || e.doneAt)).toBe(false);
    expect(res.entries.find((e) => e.id === 'f')?.decision).toBe(true);
    // Once moved, nothing more to do.
    expect(needsStatusMigration(res.entries)).toBe(false);
    expect(migrateStatusToRows(nodes, res.entries).changed).toBe(false);
  });
  it('keeps a status-only entry that is a question, an answer or a decision', () => {
    const res = migrateStatusToRows([{ id: 1 }], [
      E({ id: 'q', anchorNodeId: 1, createdAt: 1, type: 'question', text: '', status: 'followup' }),
      E({ id: 'y', anchorNodeId: 1, createdAt: 2, answerTo: 'q', verdict: 'yes', status: 'confirmed' })
    ]);
    expect(res.entries.map((e) => e.id)).toEqual(['q', 'y']);
    expect(res.rows.get(1)).toEqual({ marker: 'confirmed', markerAt: 2 });
  });
  it('counts one follow-up per Follow-up row', () => {
    expect(documentProgress([{ id: 1, marker: 'followup' }, { id: 2 }, { id: 3, marker: 'issue' }], [], []).followups).toBe(2);
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
    E({ id: 'b', anchorNodeId: 2, type: 'question', text: 'B?' }), E({ anchorNodeId: 2, answerTo: 'b', text: 'No' }),
    E({ id: 'c', anchorNodeId: 3, type: 'question', text: 'C?' }), E({ anchorNodeId: 3, answerTo: 'c', text: 'Won\u2019t answer' })
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
    E({ id: 'p', anchorNodeId: 1, type: 'question', text: 'Budget?' }), E({ anchorNodeId: 1, answerTo: 'p', text: 'Won\u2019t answer' }),
    E({ anchorNodeId: 1, text: 'A comment' }),
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

describe('openItemAge', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  const daysAgo = (d: number) => now - d * 86400000;
  it('says today, then days, weeks and months', () => {
    expect(openItemAge(daysAgo(0.5), now)).toBe('today');
    expect(openItemAge(daysAgo(3), now)).toBe('3d');
    expect(openItemAge(daysAgo(20), now)).toBe('2w');
    expect(openItemAge(daysAgo(130), now)).toBe('4mo');
  });
  it('is empty when the time is unknown', () => {
    expect(openItemAge(undefined, now)).toBe('');
    expect(openItemAge(0, now)).toBe('');
  });
});

describe('threadReadingOrder (replies, owner decision 2026-10-27)', () => {
  it('puts replies under their entry, one level, and keeps the rest in time order', () => {
    const t = [
      { id: 'q', type: 'question' as const, createdAt: 1 },
      { id: 'c', createdAt: 2 },
      { id: 'a', answerTo: 'q', createdAt: 3 },
      { id: 'r', answerTo: 'c', createdAt: 4 },
      { id: 'rr', answerTo: 'r', createdAt: 5 },
      { id: 'lost', answerTo: 'gone', createdAt: 6 }
    ];
    expect(threadReadingOrder(t).map((o) => (o.nested ? '  ' : '') + o.entry.id)).toEqual(['q', '  a', 'c', '  r', '  rr', 'lost']);
    expect(threadReplyParent(t[4], t)?.id).toBe('c');
    expect(threadReplyParent(t[5], t)).toBeNull();
  });
});

describe('migrateThreadSimplify (owner decision 2026-10-27: open or answered, one time)', () => {
  it('folds Yes / No into the text, closes a won\'t-answer question with a reply, and keeps one time', () => {
    const noon = new Date(2026, 9, 20, 9, 30).getTime();
    const { entries, changed } = migrateThreadSimplify([
      E({ id: 'q', anchorNodeId: 1, type: 'question', text: 'Ready?', date: '2026-10-20', createdAt: noon }),
      E({ id: 'a', anchorNodeId: 1, answerTo: 'q', verdict: 'yes', text: '', date: '2026-10-21', createdAt: noon + 1 }),
      E({ id: 'b', anchorNodeId: 1, answerTo: 'q', verdict: 'no', text: 'Not before Friday.', createdAt: noon + 2 }),
      E({ id: 'c', anchorNodeId: 1, answerTo: 'q', verdict: 'no', text: 'no, never', createdAt: noon + 3 }),
      E({ id: 'w', anchorNodeId: 1, type: 'question', person: 'Ana', text: 'Later?', wontAnswer: true, createdAt: noon + 4 })
    ]);
    expect(changed).toBe(true);
    expect(entries.map((e) => [e.id, e.text])).toEqual([['q', 'Ready?'], ['a', 'Yes'], ['b', 'No. Not before Friday.'], ['c', 'no, never'], ['w', 'Later?'], ['w-w', 'Won\u2019t answer']]);
    expect(entries.some((e) => 'verdict' in e || 'wontAnswer' in e || 'date' in e)).toBe(false);
    // The day moves the time onto it; the time of day stays.
    expect(entries[0].createdAt).toBe(noon);
    expect(new Date(entries[1].createdAt!).getDate()).toBe(21);
    expect(new Date(entries[1].createdAt!).getHours()).toBe(9);
    expect(entries[5]).toMatchObject({ answerTo: 'w', person: 'Ana' });
    expect(questionState(entries[4], entries)).toBe('answered');
    expect(migrateThreadSimplify(entries).changed).toBe(false);
  });
});

describe('one kind per entry (owner, 2026-10-27)', () => {
  it('an entry that was both a question and a decision becomes the decision', () => {
    const { entries } = migrateThreadSimplify([E({ id: 'x', anchorNodeId: 1, type: 'question', decision: true, createdAt: 1 })]);
    expect([entries[0].type, entries[0].decision]).toEqual([undefined, true]);
  });
});
