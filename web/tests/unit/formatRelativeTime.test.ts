import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '../../src/utils/formatRelativeTime';

// Pinned local oracle — a literal copy of index.html's current formatRelativeTime(), modified
// ONLY to accept an injected `now` (same minimal change made to the real extraction, for the
// same reason: deterministic testing without waiting in real time or mocking global Date).
function originalFormatRelativeTime(ts: number | null | undefined, now: number): string {
  if (!ts) return '—';
  const secs = Math.floor((now - ts) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const NOW = new Date('2026-08-20T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('returns an em dash for falsy/missing timestamps', () => {
    expect(formatRelativeTime(0, NOW)).toBe('—');
    expect(formatRelativeTime(null, NOW)).toBe('—');
    expect(formatRelativeTime(undefined, NOW)).toBe('—');
  });

  it('returns "just now" for under 5 seconds ago', () => {
    expect(formatRelativeTime(NOW - 0 * 1000, NOW)).toBe('just now');
    expect(formatRelativeTime(NOW - 4 * 1000, NOW)).toBe('just now');
  });

  it('returns seconds-ago at the 5s boundary and up to 59s', () => {
    expect(formatRelativeTime(NOW - 5 * 1000, NOW)).toBe('5s ago');
    expect(formatRelativeTime(NOW - 59 * 1000, NOW)).toBe('59s ago');
  });

  it('returns minutes-ago at the 60s boundary and up to 59m', () => {
    expect(formatRelativeTime(NOW - 60 * 1000, NOW)).toBe('1m ago');
    expect(formatRelativeTime(NOW - 59 * 60 * 1000, NOW)).toBe('59m ago');
  });

  it('returns hours-ago at the 60m boundary and up to 23h', () => {
    expect(formatRelativeTime(NOW - 60 * 60 * 1000, NOW)).toBe('1h ago');
    expect(formatRelativeTime(NOW - 23 * 60 * 60 * 1000, NOW)).toBe('23h ago');
  });

  it('falls back to an absolute short date at the 24h boundary', () => {
    const ts = NOW - 24 * 60 * 60 * 1000;
    expect(formatRelativeTime(ts, NOW)).toBe(new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  });

  it('falls back to an absolute short date for anything well over a day old', () => {
    const ts = NOW - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    expect(formatRelativeTime(ts, NOW)).toBe(new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  });

  it('defaults `now` to the real Date.now() when not provided, matching the original call signature', () => {
    // Every real call site in index.html calls this with exactly one argument.
    const result = formatRelativeTime(Date.now() - 2000);
    expect(result).toBe('just now');
  });

  it('matches the pinned original across every boundary and a spread of ages', () => {
    const ages = [0, 1, 4, 5, 30, 59, 60, 61, 1800, 3599, 3600, 3601, 82800, 86399, 86400, 86401, 2592000];
    for (const ageSeconds of ages) {
      const ts = NOW - ageSeconds * 1000;
      expect(formatRelativeTime(ts, NOW)).toBe(originalFormatRelativeTime(ts, NOW));
    }
  });
});
