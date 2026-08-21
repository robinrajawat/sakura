import { describe, it, expect } from 'vitest';
import { computeDueRemindersCore, ReminderTask } from '../../src/state/hubReminders';

function task(overrides: Partial<ReminderTask>): ReminderTask {
  return { id: 't1', done: false, dueDate: null, text: 'Task', ...overrides };
}

describe('computeDueRemindersCore', () => {
  it('skips a done task even if overdue', () => {
    const result = computeDueRemindersCore([task({ done: true, dueDate: '2026-08-01' })], '2026-08-21', {});
    expect(result.reminders).toEqual([]);
  });

  it('skips a task with no due date', () => {
    const result = computeDueRemindersCore([task({ dueDate: null })], '2026-08-21', {});
    expect(result.reminders).toEqual([]);
  });

  it('skips a task whose due date is still in the future', () => {
    const result = computeDueRemindersCore([task({ dueDate: '2026-08-22' })], '2026-08-21', {});
    expect(result.reminders).toEqual([]);
  });

  it('skips a task already notified today', () => {
    const t = task({ id: 't1', dueDate: '2026-08-21' });
    const result = computeDueRemindersCore([t], '2026-08-21', { t1: '2026-08-21' });
    expect(result.reminders).toEqual([]);
  });

  it('does NOT skip a task notified on a different (earlier) day', () => {
    const t = task({ id: 't1', dueDate: '2026-08-21' });
    const result = computeDueRemindersCore([t], '2026-08-21', { t1: '2026-08-20' });
    expect(result.reminders).toHaveLength(1);
  });

  it('produces a "Due today:" title for a task due exactly today', () => {
    const t = task({ id: 't1', text: 'Ship release', dueDate: '2026-08-21' });
    const result = computeDueRemindersCore([t], '2026-08-21', {});
    expect(result.reminders).toEqual([{ taskId: 't1', title: 'Due today: Ship release' }]);
  });

  it('produces an "Overdue:" title for a task due before today', () => {
    const t = task({ id: 't1', text: 'File taxes', dueDate: '2026-08-01' });
    const result = computeDueRemindersCore([t], '2026-08-21', {});
    expect(result.reminders).toEqual([{ taskId: 't1', title: 'Overdue: File taxes' }]);
  });

  it('marks every eligible task as notified for today in the returned map', () => {
    const t = task({ id: 't1', dueDate: '2026-08-21' });
    const result = computeDueRemindersCore([t], '2026-08-21', {});
    expect(result.notifiedMap).toEqual({ t1: '2026-08-21' });
  });

  it('never mutates the input notifiedMap object', () => {
    const input = { existing: '2026-08-20' };
    const t = task({ id: 't1', dueDate: '2026-08-21' });
    const result = computeDueRemindersCore([t], '2026-08-21', input);
    expect(input).toEqual({ existing: '2026-08-20' });
    expect(result.notifiedMap).not.toBe(input);
    expect(result.notifiedMap).toEqual({ existing: '2026-08-20', t1: '2026-08-21' });
  });

  it('preserves unrelated existing entries in the notified map', () => {
    const result = computeDueRemindersCore([], '2026-08-21', { old: '2026-08-01' });
    expect(result.notifiedMap).toEqual({ old: '2026-08-01' });
  });

  it('processes multiple tasks, preserving input order, mixing eligible and skipped', () => {
    const t1 = task({ id: 't1', text: 'A', dueDate: '2026-08-01' }); // overdue, eligible
    const t2 = task({ id: 't2', text: 'B', done: true, dueDate: '2026-08-01' }); // done, skipped
    const t3 = task({ id: 't3', text: 'C', dueDate: '2026-08-21' }); // due today, eligible
    const t4 = task({ id: 't4', text: 'D', dueDate: '2026-08-22' }); // future, skipped
    const result = computeDueRemindersCore([t1, t2, t3, t4], '2026-08-21', {});
    expect(result.reminders).toEqual([
      { taskId: 't1', title: 'Overdue: A' },
      { taskId: 't3', title: 'Due today: C' },
    ]);
    expect(result.notifiedMap).toEqual({ t1: '2026-08-21', t3: '2026-08-21' });
  });

  it('returns an empty reminders list and an unchanged-shape map for an empty todo list', () => {
    const result = computeDueRemindersCore([], '2026-08-21', { x: '2026-08-20' });
    expect(result.reminders).toEqual([]);
    expect(result.notifiedMap).toEqual({ x: '2026-08-20' });
  });
});
