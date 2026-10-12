import { describe, it, expect } from 'vitest';
import { normalizeColumnType, formatCurrency, formatColumnDate } from '../../src/utils/columnType';

describe('normalizeColumnType', () => {
  it('keeps known types and treats anything else as automatic', () => {
    expect(normalizeColumnType('Status')).toBe('status');
    expect(normalizeColumnType('currency')).toBe('currency');
    expect(normalizeColumnType('money')).toBe('');
    expect(normalizeColumnType(null)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('writes symbol, separators and the currency\'s decimals', () => {
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatCurrency(-12, 'USD')).toBe('-$12.00');
    expect(formatCurrency(1500, 'JPY')).toBe('¥1,500');
    expect(formatCurrency(123456, 'INR')).toBe('₹123,456.00');
    expect(formatCurrency(3, 'XXX')).toBe('€3.00');
    expect(formatCurrency(NaN, 'EUR')).toBe('');
  });
});

describe('formatColumnDate', () => {
  const oct14 = Date.UTC(2026, 9, 14);
  it('matches the column\'s existing style', () => {
    expect(formatColumnDate(oct14)).toBe('2026-10-14');
    expect(formatColumnDate(oct14, '2026-01-02')).toBe('2026-10-14');
    expect(formatColumnDate(oct14, 'Oct 1, 2026')).toBe('Oct 14, 2026');
  });
});
