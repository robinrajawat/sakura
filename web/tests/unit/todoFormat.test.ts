import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// The To-Dos panel's pure helpers (src/core/todoFormat.ts, moved out of the panel's closure in
// index.html 2026-10-25). isWaiting/waitingLabel come from the todoModel block in the page.
type F = typeof import('../../src/core/todoFormat');
let f: F;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.isWaiting = (t: { waitingFor?: unknown }) => typeof t.waitingFor === 'string';
  g.waitingLabel = (t: { waitingFor?: string }) => (t.waitingFor ? 'Waiting for ' + t.waitingFor : 'Waiting');
  f = await import('../../src/core/todoFormat');
});
// Saturday 2026-10-24, mid-morning local time.
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 24, 10, 30)); });
afterEach(() => vi.useRealTimers());

describe('dates', () => {
  it('toISODate / parseISODate round-trip in local time; bad input parses to null', () => {
    expect(f.toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(f.toISODate(f.parseISODate('2026-12-31'))).toBe('2026-12-31');
    expect(f.parseISODate('2026-1-5')).toBeNull();
    expect(f.parseISODate(undefined)).toBeNull();
  });

  it('dueDatePreset counts days from today', () => {
    expect(f.dueDatePreset(0)).toBe('2026-10-24');
    expect(f.dueDatePreset(1)).toBe('2026-10-25');
    expect(f.dueDatePreset(8)).toBe('2026-11-01');
  });

  it('nextRepeatDate: daily, weekly, weekdays skip the weekend; no date starts from today', () => {
    expect(f.nextRepeatDate('2026-10-23', 'daily')).toBe('2026-10-24');
    expect(f.nextRepeatDate('2026-10-23', 'weekly')).toBe('2026-10-30');
    expect(f.nextRepeatDate('2026-10-23', 'weekdays')).toBe('2026-10-26'); // Fri → Mon
    expect(f.nextRepeatDate(null, 'daily')).toBe('2026-10-25');
    expect(f.nextRepeatDate('2026-10-23', null)).toBe('2026-10-23');
  });

  it('fmtDue says Today/Tomorrow/Yesterday, else a short date', () => {
    expect(f.fmtDue('2026-10-24')).toBe('Today');
    expect(f.fmtDue('2026-10-25')).toBe('Tomorrow');
    expect(f.fmtDue('2026-10-23')).toBe('Yesterday');
    expect(f.fmtDue('2026-12-02')).toBe(new Date(2026, 11, 2).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(f.fmtDue('')).toBe('');
  });

  it('dueShort uses a weekday for 2–6 days ahead, else fmtDue', () => {
    expect(f.dueShort('2026-10-27')).toBe(new Date(2026, 9, 27).toLocaleDateString(undefined, { weekday: 'short' }));
    expect(f.dueShort('2026-10-25')).toBe('Tomorrow');
    expect(f.dueShort('2026-11-10')).toBe(f.fmtDue('2026-11-10'));
    expect(f.dueShort('nope')).toBe('');
  });

  it('isOverdue: before today and not done', () => {
    expect(f.isOverdue('2026-10-23', false)).toBe(true);
    expect(f.isOverdue('2026-10-24', false)).toBe(false);
    expect(f.isOverdue('2026-10-23', true)).toBe(false);
    expect(f.isOverdue(null, false)).toBe(false);
  });
});

describe('labels, links, search', () => {
  it('repeatLabel / repeatTitle', () => {
    expect(f.repeatLabel('weekdays')).toBe('Weekdays');
    expect(f.repeatLabel(null)).toBe('Repeat');
    expect(f.repeatTitle('daily')).toBe('Repeats daily');
    expect(f.repeatTitle(null)).toBe('Set repeat');
  });

  it('normalizeLinkUrl adds https:// to bare addresses and keeps other schemes', () => {
    expect(f.normalizeLinkUrl(' example.com/x ')).toBe('https://example.com/x');
    expect(f.normalizeLinkUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(f.normalizeLinkUrl('  ')).toBeNull();
    expect(f.normalizeLinkUrl('x'.repeat(3000))?.length).toBe(2000);
  });

  it('fmtLink shows the host without www, or a short fallback', () => {
    expect(f.fmtLink('https://www.example.com/a/b')).toBe('example.com');
    expect(f.fmtLink('not a url')).toBe('not a url');
    expect(f.fmtLink('')).toBe('');
  });

  it('taskMatchesSearch looks at text, waiting, due date (raw and shown), repeat and link', () => {
    const t = { text: 'Call bank', waitingFor: 'Karsten', dueDate: '2026-10-25', repeat: 'weekly', link: 'https://x.io', linkLabel: 'Docs' };
    for (const q of ['', 'bank', 'karsten', '2026-10', 'tomorrow', 'weekly', 'x.io', 'docs']) expect(f.taskMatchesSearch(t, q), q).toBe(true);
    expect(f.taskMatchesSearch(t, 'zebra')).toBe(false);
  });

  it('todosHistorySummary counts open and done', () => {
    expect(f.todosHistorySummary([{ done: false }, { done: true }, { done: false }])).toBe('2 open, 1 done');
    expect(f.todosHistorySummary([])).toBe('empty');
    expect(f.todosHistorySummary(null)).toBe('empty');
  });
});
