import { describe, expect, it } from 'vitest';
import { formatNow } from './formatNow';

describe('formatNow', () => {
  it('matches legacy\'s own default format: "Month DD, YYYY, H:MM AM/PM"', () => {
    const fixed = new Date(2026, 0, 5, 15, 45); // January 5, 2026, 3:45 PM
    expect(formatNow(fixed)).toBe('January 05, 2026, 03:45 PM');
  });

  it('pads a single-digit day', () => {
    const fixed = new Date(2026, 5, 3, 9, 5); // June 3, 2026, 9:05 AM
    expect(formatNow(fixed)).toBe('June 03, 2026, 09:05 AM');
  });

  it('handles midnight and noon correctly', () => {
    expect(formatNow(new Date(2026, 0, 1, 0, 0))).toContain('12:00 AM');
    expect(formatNow(new Date(2026, 0, 1, 12, 0))).toContain('12:00 PM');
  });

  it('defaults to the current time when called with no argument', () => {
    const before = Date.now();
    const result = formatNow();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(Date.now() - before).toBeLessThan(1000);
  });
});
