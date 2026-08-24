import { describe, it, expect } from 'vitest';
import {
  recapStartOfDay,
  getRecapRange,
  inRecapRange,
  collectRecapTodoItems,
  collectRecapMeetingItems,
  collectRecapJournalItems
} from './hubRecap';

// Wednesday 2026-08-19 12:00:00 local time -- a mid-week anchor so "this week"/"last week"
// boundaries are unambiguous (Monday-start weeks).
const WED = new Date(2026, 7, 19, 12, 0, 0).getTime();

describe('recapStartOfDay', () => {
  it('zeroes out the time-of-day, keeping the calendar date', () => {
    const ts = new Date(2026, 7, 19, 15, 30, 45).getTime();
    const result = new Date(recapStartOfDay(ts));
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getDate()).toBe(19);
  });
});

describe('getRecapRange', () => {
  it('today spans exactly the calendar day containing `now`', () => {
    const range = getRecapRange('today', WED);
    expect(new Date(range.start).getHours()).toBe(0);
    expect(range.end - range.start).toBe(86400000);
    expect(new Date(range.start).getDate()).toBe(19);
  });

  it('week is Monday 00:00 through the following Monday 00:00', () => {
    const range = getRecapRange('week', WED);
    const start = new Date(range.start);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getDate()).toBe(17); // Mon 2026-08-17
    expect(range.end - range.start).toBe(7 * 86400000);
  });

  it('lastWeek is the seven days immediately before this week', () => {
    const thisWeek = getRecapRange('week', WED);
    const lastWeek = getRecapRange('lastWeek', WED);
    expect(lastWeek.end).toBe(thisWeek.start);
    expect(thisWeek.start - lastWeek.start).toBe(7 * 86400000);
  });

  it('a Sunday belongs to the week that started the preceding Monday, not the next one', () => {
    // Sunday 2026-08-23 -- still inside the same Mon 08-17..Mon 08-24 week as WED above.
    const sunday = new Date(2026, 7, 23, 9, 0, 0).getTime();
    const range = getRecapRange('week', sunday);
    expect(new Date(range.start).getDate()).toBe(17);
  });

  it('defaults `now` to the real current time when omitted', () => {
    const range = getRecapRange('today');
    expect(range.end - range.start).toBe(86400000);
    expect(range.start).toBeLessThanOrEqual(Date.now());
  });
});

describe('inRecapRange', () => {
  const range = { start: 1000, end: 2000 };

  it('true for a timestamp within [start, end)', () => {
    expect(inRecapRange(1000, range)).toBe(true);
    expect(inRecapRange(1999, range)).toBe(true);
  });

  it('false for a timestamp at or past end, or before start', () => {
    expect(inRecapRange(2000, range)).toBe(false);
    expect(inRecapRange(999, range)).toBe(false);
  });

  it('false for null/undefined/non-finite', () => {
    expect(inRecapRange(null, range)).toBe(false);
    expect(inRecapRange(undefined, range)).toBe(false);
    expect(inRecapRange(NaN, range)).toBe(false);
  });
});

describe('collectRecapTodoItems', () => {
  const range = { start: 1000, end: 2000 };

  it('a done todo completed in range counts as completed', () => {
    const result = collectRecapTodoItems([{ id: 'a', text: 'Ship it', done: true, createdAt: 0, completedAt: 1500 }], range);
    expect(result).toEqual([{ kind: 'completed', id: 'a', text: 'Ship it', ts: 1500 }]);
  });

  it('an open todo created in range counts as created', () => {
    const result = collectRecapTodoItems([{ id: 'a', text: 'Write docs', done: false, createdAt: 1200, completedAt: null }], range);
    expect(result).toEqual([{ kind: 'created', id: 'a', text: 'Write docs', ts: 1200 }]);
  });

  it('completed-in-range wins over created-in-range for the same todo (else-if, no double count)', () => {
    const result = collectRecapTodoItems([{ id: 'a', text: 'x', done: true, createdAt: 1100, completedAt: 1500 }], range);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('completed');
  });

  it('a todo completed outside the range but created inside it counts as created', () => {
    const result = collectRecapTodoItems([{ id: 'a', text: 'x', done: true, createdAt: 1200, completedAt: 5000 }], range);
    expect(result).toEqual([{ kind: 'created', id: 'a', text: 'x', ts: 1200 }]);
  });

  it('excludes a todo with no in-range activity at all', () => {
    expect(collectRecapTodoItems([{ id: 'a', text: 'x', done: false, createdAt: 5000, completedAt: null }], range)).toEqual([]);
  });

  it('sorts results newest-first by ts', () => {
    const result = collectRecapTodoItems(
      [
        { id: 'a', text: 'first', done: false, createdAt: 1100, completedAt: null },
        { id: 'b', text: 'second', done: false, createdAt: 1800, completedAt: null }
      ],
      range
    );
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('collectRecapMeetingItems', () => {
  const range = { start: 1000, end: 2000 };

  it('created-in-range counts as created', () => {
    const result = collectRecapMeetingItems([{ id: 'm1', title: 'Standup', createdAt: 1200, modifiedAt: 1200 }], range);
    expect(result).toEqual([{ kind: 'created', id: 'm1', text: 'Standup', ts: 1200 }]);
  });

  it('modified-in-range (and different from createdAt) counts as updated', () => {
    const result = collectRecapMeetingItems([{ id: 'm1', title: 'Standup', createdAt: 0, modifiedAt: 1500 }], range);
    expect(result).toEqual([{ kind: 'updated', id: 'm1', text: 'Standup', ts: 1500 }]);
  });

  it('created wins over updated for the same meeting', () => {
    const result = collectRecapMeetingItems([{ id: 'm1', title: 'Standup', createdAt: 1100, modifiedAt: 1500 }], range);
    expect(result).toEqual([{ kind: 'created', id: 'm1', text: 'Standup', ts: 1100 }]);
  });

  it('falls back to "Untitled meeting" for an empty title', () => {
    const result = collectRecapMeetingItems([{ id: 'm1', title: '', createdAt: 1200, modifiedAt: 1200 }], range);
    expect(result[0].text).toBe('Untitled meeting');
  });

  it('modifiedAt equal to createdAt does not count as a separate update', () => {
    const range2 = { start: 0, end: 5000 };
    const result = collectRecapMeetingItems([{ id: 'm1', title: 'x', createdAt: 3000, modifiedAt: 3000 }], range2);
    expect(result).toEqual([{ kind: 'created', id: 'm1', text: 'x', ts: 3000 }]);
  });
});

describe('collectRecapJournalItems', () => {
  const range = { start: 1000, end: 2000 };

  it('created-in-range counts as created, keyed by date', () => {
    const result = collectRecapJournalItems([{ date: '2026-08-19', mood: 'good', createdAt: 1200, modifiedAt: 1200 }], range);
    expect(result).toEqual([{ kind: 'created', date: '2026-08-19', mood: 'good', ts: 1200 }]);
  });

  it('modified-in-range (and different from createdAt) counts as updated', () => {
    const result = collectRecapJournalItems([{ date: '2026-08-19', mood: '', createdAt: 0, modifiedAt: 1500 }], range);
    expect(result).toEqual([{ kind: 'updated', date: '2026-08-19', mood: '', ts: 1500 }]);
  });

  it('sorts results newest-first by ts', () => {
    const result = collectRecapJournalItems(
      [
        { date: '2026-08-17', mood: '', createdAt: 1100, modifiedAt: 1100 },
        { date: '2026-08-18', mood: '', createdAt: 1800, modifiedAt: 1800 }
      ],
      range
    );
    expect(result.map((r) => r.date)).toEqual(['2026-08-18', '2026-08-17']);
  });
});
