import { describe, it, expect } from 'vitest';
import { todayDateStr, formatRemarkDateDisplay } from './remarkDate';

describe('todayDateStr', () => {
  it('formats as YYYY-MM-DD, zero-padded', () => {
    expect(todayDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayDateStr(new Date(2026, 10, 23))).toBe('2026-11-23');
  });
});

describe('formatRemarkDateDisplay', () => {
  const now = new Date(2026, 7, 24); // Aug 24, 2026

  it('returns "Today" for today\'s date', () => {
    expect(formatRemarkDateDisplay('2026-08-24', now)).toBe('Today');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    expect(formatRemarkDateDisplay('2026-08-23', now)).toBe('Yesterday');
  });

  it('returns a short month/day for other dates this year', () => {
    expect(formatRemarkDateDisplay('2026-08-01', now)).toBe('Aug 1');
  });

  it('includes the year for dates in a different year', () => {
    expect(formatRemarkDateDisplay('2025-08-01', now)).toBe('Aug 1, 2025');
  });

  it('falls back to today when no date is given', () => {
    expect(formatRemarkDateDisplay('', now)).toBe('Today');
    expect(formatRemarkDateDisplay(null, now)).toBe('Today');
    expect(formatRemarkDateDisplay(undefined, now)).toBe('Today');
  });

  it('returns the raw string for malformed input', () => {
    expect(formatRemarkDateDisplay('not-a-date', now)).toBe('not-a-date');
  });
});
