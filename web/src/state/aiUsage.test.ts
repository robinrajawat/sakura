import { describe, expect, it, beforeEach } from 'vitest';
import { todayStrCore, parseAiUsageCore, recordAiUsageCore, getAiUsageForProviderCore, formatAgoCore, recordAiUsage, getAiUsageForProvider } from './aiUsage';

describe('todayStrCore (pure)', () => {
  it('formats a local calendar date as YYYY-MM-DD, zero-padded', () => {
    expect(todayStrCore(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayStrCore(new Date(2026, 10, 23))).toBe('2026-11-23');
  });
});

describe('parseAiUsageCore (pure)', () => {
  it('parses a valid usage blob', () => {
    expect(parseAiUsageCore('{"gemini":{"date":"2026-01-01","count":3,"fails":1}}')).toEqual({
      gemini: { date: '2026-01-01', count: 3, fails: 1 }
    });
  });
  it('returns {} for null input', () => {
    expect(parseAiUsageCore(null)).toEqual({});
  });
  it('returns {} for corrupt JSON', () => {
    expect(parseAiUsageCore('{not json')).toEqual({});
  });
  it('returns {} for a non-object value', () => {
    expect(parseAiUsageCore('42')).toEqual({});
  });
});

describe('recordAiUsageCore (pure)', () => {
  const now = new Date(2026, 0, 5, 10, 0, 0);

  it('creates a fresh entry for a provider with no prior usage', () => {
    const next = recordAiUsageCore({}, 'gemini', true, undefined, now);
    expect(next.gemini).toEqual({ date: '2026-01-05', count: 1, fails: 0, lastTs: now.getTime(), lastOk: true, lastNote: '' });
  });

  it('increments count in place for a same-day entry', () => {
    const usage = { gemini: { date: '2026-01-05', count: 2, fails: 0 } };
    const next = recordAiUsageCore(usage, 'gemini', true, undefined, now);
    expect(next.gemini.count).toBe(3);
  });

  it('increments fails only on a failed call', () => {
    const usage = { gemini: { date: '2026-01-05', count: 1, fails: 0 } };
    const next = recordAiUsageCore(usage, 'gemini', false, 'rate limited', now);
    expect(next.gemini.fails).toBe(1);
    expect(next.gemini.lastOk).toBe(false);
    expect(next.gemini.lastNote).toBe('rate limited');
  });

  it('resets to a fresh entry when the stored date is stale', () => {
    const usage = { gemini: { date: '2025-12-31', count: 50, fails: 10 } };
    const next = recordAiUsageCore(usage, 'gemini', true, undefined, now);
    expect(next.gemini.count).toBe(1);
    expect(next.gemini.fails).toBe(0);
  });

  it('truncates a note to 200 chars', () => {
    const next = recordAiUsageCore({}, 'gemini', false, 'x'.repeat(300), now);
    expect(next.gemini.lastNote?.length).toBe(200);
  });

  it('does not mutate the input map', () => {
    const usage = { gemini: { date: '2026-01-05', count: 1, fails: 0 } };
    recordAiUsageCore(usage, 'gemini', true, undefined, now);
    expect(usage.gemini.count).toBe(1);
  });
});

describe('getAiUsageForProviderCore (pure)', () => {
  const now = new Date(2026, 0, 5);

  it('returns zeroed usage for a provider with no entry', () => {
    expect(getAiUsageForProviderCore({}, 'gemini', now)).toEqual({ date: '2026-01-05', count: 0, fails: 0 });
  });

  it('returns zeroed usage when the stored entry is from a different day', () => {
    const usage = { gemini: { date: '2025-12-31', count: 5, fails: 2 } };
    expect(getAiUsageForProviderCore(usage, 'gemini', now)).toEqual({ date: '2026-01-05', count: 0, fails: 0 });
  });

  it('returns the real entry for today', () => {
    const usage = { gemini: { date: '2026-01-05', count: 5, fails: 2 } };
    expect(getAiUsageForProviderCore(usage, 'gemini', now)).toEqual(usage.gemini);
  });
});

describe('formatAgoCore (pure)', () => {
  const now = 1000000;
  it('returns "" for a null/undefined timestamp', () => {
    expect(formatAgoCore(null, now)).toBe('');
    expect(formatAgoCore(undefined, now)).toBe('');
  });
  it('formats seconds', () => {
    expect(formatAgoCore(now - 5000, now)).toBe('5s ago');
  });
  it('formats minutes', () => {
    expect(formatAgoCore(now - 5 * 60 * 1000, now)).toBe('5m ago');
  });
  it('formats hours', () => {
    expect(formatAgoCore(now - 5 * 60 * 60 * 1000, now)).toBe('5h ago');
  });
  it('formats days', () => {
    expect(formatAgoCore(now - 3 * 24 * 60 * 60 * 1000, now)).toBe('3d ago');
  });
});

describe('recordAiUsage / getAiUsageForProvider (storage wrappers)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips through localStorage', () => {
    recordAiUsage('gemini', true);
    recordAiUsage('gemini', false, 'boom');
    const usage = getAiUsageForProvider('gemini');
    expect(usage.count).toBe(2);
    expect(usage.fails).toBe(1);
    expect(usage.lastOk).toBe(false);
    expect(usage.lastNote).toBe('boom');
  });

  it('is a no-op for an empty providerId', () => {
    recordAiUsage('', true);
    expect(localStorage.getItem('sakura_ai_usage_v1')).toBe(null);
  });

  it('keeps separate counters per provider', () => {
    recordAiUsage('gemini', true);
    recordAiUsage('groq', true);
    recordAiUsage('groq', true);
    expect(getAiUsageForProvider('gemini').count).toBe(1);
    expect(getAiUsageForProvider('groq').count).toBe(2);
  });
});
