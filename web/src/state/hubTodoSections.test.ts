import { describe, it, expect } from 'vitest';
import {
  daysOverdueLabel,
  formatShortDueDate,
  formatDueDisplay,
  relativeCompletedLabel,
  groupOpenTodosCore,
  sortCompletedTodosCore,
  searchOpenTodosCore,
  type SectionableTodo
} from './hubTodoSections';

function todo(overrides: Partial<SectionableTodo> & { id: string }): SectionableTodo {
  return { text: '', done: false, dueDate: null, completedAt: null, ...overrides };
}

describe('daysOverdueLabel', () => {
  it('reads "1 day overdue" for exactly one day', () => {
    expect(daysOverdueLabel('2026-08-23', '2026-08-24')).toBe('1 day overdue');
  });
  it('reads "N days overdue" for more than one day', () => {
    expect(daysOverdueLabel('2026-08-20', '2026-08-24')).toBe('4 days overdue');
  });
  it('floors to "1 day overdue" for same-day (edge case)', () => {
    expect(daysOverdueLabel('2026-08-24', '2026-08-24')).toBe('1 day overdue');
  });
});

describe('formatShortDueDate', () => {
  it('formats as month + day', () => {
    expect(formatShortDueDate('2026-08-24')).toBe(
      new Date('2026-08-24T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    );
  });
});

describe('formatDueDisplay', () => {
  const today = '2026-08-24';
  it('returns "Today" for today', () => {
    expect(formatDueDisplay(today, today)).toBe('Today');
  });
  it('returns "Tomorrow" for one day ahead', () => {
    expect(formatDueDisplay('2026-08-25', today)).toBe('Tomorrow');
  });
  it('returns "Yesterday" for one day behind', () => {
    expect(formatDueDisplay('2026-08-23', today)).toBe('Yesterday');
  });
  it('returns a weekday+date string otherwise', () => {
    const result = formatDueDisplay('2026-09-01', today);
    expect(result).toBe(
      new Date('2026-09-01T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    );
  });
});

describe('relativeCompletedLabel', () => {
  const now = new Date('2026-08-24T12:00:00').getTime();
  it('returns empty string for no timestamp', () => {
    expect(relativeCompletedLabel(null, now)).toBe('');
    expect(relativeCompletedLabel(undefined, now)).toBe('');
  });
  it('returns "Completed today" for zero or negative day diff', () => {
    expect(relativeCompletedLabel(now, now)).toBe('Completed today');
  });
  it('returns "Completed yesterday" for exactly one day', () => {
    expect(relativeCompletedLabel(now - 86400000, now)).toBe('Completed yesterday');
  });
  it('returns "Completed N days ago" under a week', () => {
    expect(relativeCompletedLabel(now - 3 * 86400000, now)).toBe('Completed 3 days ago');
  });
  it('returns a short absolute date at a week or more', () => {
    const ts = now - 8 * 86400000;
    expect(relativeCompletedLabel(ts, now)).toBe(
      'Completed ' + new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    );
  });
});

describe('groupOpenTodosCore', () => {
  const today = '2026-08-24';
  it('sections open tasks by due-date urgency, in fixed label order', () => {
    const todos = [
      todo({ id: '1', dueDate: '2026-08-20' }), // overdue
      todo({ id: '2', dueDate: today }), // today
      todo({ id: '3', dueDate: '2026-08-30' }), // upcoming
      todo({ id: '4', dueDate: null }), // no date
      todo({ id: '5', done: true, dueDate: '2026-08-20' }) // completed, excluded entirely
    ];
    const sections = groupOpenTodosCore(todos, today);
    expect(sections.map((s) => s.label)).toEqual(['Overdue', 'Today', 'Upcoming', 'No Date']);
    expect(sections[0].tasks.map((t) => t.id)).toEqual(['1']);
    expect(sections[1].tasks.map((t) => t.id)).toEqual(['2']);
    expect(sections[2].tasks.map((t) => t.id)).toEqual(['3']);
    expect(sections[3].tasks.map((t) => t.id)).toEqual(['4']);
  });

  it('sorts overdue and upcoming sections by due date ascending', () => {
    const todos = [
      todo({ id: 'a', dueDate: '2026-08-15' }),
      todo({ id: 'b', dueDate: '2026-08-10' }),
      todo({ id: 'c', dueDate: '2026-09-05' }),
      todo({ id: 'd', dueDate: '2026-09-01' })
    ];
    const sections = groupOpenTodosCore(todos, today);
    expect(sections[0].tasks.map((t) => t.id)).toEqual(['b', 'a']);
    expect(sections[2].tasks.map((t) => t.id)).toEqual(['d', 'c']);
  });

  it('leaves the No Date section in original push order', () => {
    const todos = [todo({ id: 'x', dueDate: null }), todo({ id: 'y', dueDate: null })];
    const sections = groupOpenTodosCore(todos, today);
    expect(sections[3].tasks.map((t) => t.id)).toEqual(['x', 'y']);
  });
});

describe('sortCompletedTodosCore', () => {
  it('returns only done tasks, newest completedAt first', () => {
    const todos = [
      todo({ id: '1', done: true, completedAt: 100 }),
      todo({ id: '2', done: false }),
      todo({ id: '3', done: true, completedAt: 300 }),
      todo({ id: '4', done: true, completedAt: 200 })
    ];
    expect(sortCompletedTodosCore(todos).map((t) => t.id)).toEqual(['3', '4', '1']);
  });

  it('treats a missing completedAt as sorting last', () => {
    const todos = [
      todo({ id: '1', done: true, completedAt: null }),
      todo({ id: '2', done: true, completedAt: 50 })
    ];
    expect(sortCompletedTodosCore(todos).map((t) => t.id)).toEqual(['2', '1']);
  });
});

describe('searchOpenTodosCore', () => {
  it('matches case-insensitively against open task text only', () => {
    const todos = [
      todo({ id: '1', text: 'Buy Milk' }),
      todo({ id: '2', text: 'Call dentist' }),
      todo({ id: '3', text: 'milk shake', done: true })
    ];
    expect(searchOpenTodosCore(todos, 'milk').map((t) => t.id)).toEqual(['1']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchOpenTodosCore([todo({ id: '1', text: 'Buy milk' })], 'zzz')).toEqual([]);
  });
});
