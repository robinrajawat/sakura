import { describe, it, expect } from 'vitest';
import {
  normalizeColumnType, formatCurrency, formatColumnDate, isCurrencyCode, currencyName, currencySymbol,
  menuCurrencies, pushRecentCurrency, currencyMatches, allCurrencyCodes
} from '../../src/utils/columnType';
import { parseCellNumber } from '../../src/utils/tableData';

describe('normalizeColumnType', () => {
  it('keeps known types and treats anything else as automatic', () => {
    expect(normalizeColumnType('Status')).toBe('status');
    expect(normalizeColumnType('currency')).toBe('currency');
    expect(normalizeColumnType('money')).toBe('');
    expect(normalizeColumnType(null)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('writes sign or code, separators and the currency\'s decimals', () => {
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatCurrency(-12, 'USD')).toBe('-$12.00');
    expect(formatCurrency(1500, 'JPY')).toBe('¥1,500');
    expect(formatCurrency(123456, 'INR')).toBe('₹123,456.00');
    expect(formatCurrency(1234.5, 'DKK')).toMatch(/^DKK\s1,234\.50$/);
    expect(formatCurrency(5, 'CAD')).toBe('CA$5.00');
    expect(formatCurrency(3, 'ZZZ')).toBe('€3.00');
    expect(formatCurrency(NaN, 'EUR')).toBe('');
  });
  it('always reads back as the same number', () => {
    for (const code of allCurrencyCodes()) {
      expect(parseCellNumber(formatCurrency(-1234.5, code)), code).toBeCloseTo(code === 'JPY' || formatCurrency(1, code).indexOf('.') < 0 ? -1235 : -1234.5, 0);
    }
  });
});

describe('currency list', () => {
  it('knows real codes, names and symbols', () => {
    expect(isCurrencyCode('DKK')).toBe(true);
    expect(isCurrencyCode('ZZZ')).toBe(false);
    expect(isCurrencyCode('dkk')).toBe(false);
    expect(currencyName('DKK')).toBe('Danish Krone');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('DKK')).toBe('DKK');
  });
  it('lists the current, then recent, then default currencies, five at most', () => {
    expect(menuCurrencies([])).toEqual(['EUR', 'USD', 'GBP', 'INR', 'JPY']);
    expect(menuCurrencies(['DKK', 'SEK'])).toEqual(['DKK', 'SEK', 'EUR', 'USD', 'GBP']);
    expect(menuCurrencies(['DKK'], 'CHF')).toEqual(['CHF', 'DKK', 'EUR', 'USD', 'GBP']);
    expect(menuCurrencies(['ZZZ', 'EUR'])).toEqual(['EUR', 'USD', 'GBP', 'INR', 'JPY']);
  });
  it('keeps recent currencies most-recent first', () => {
    expect(pushRecentCurrency(['EUR', 'DKK'], 'DKK')).toEqual(['DKK', 'EUR']);
    expect(pushRecentCurrency(['A', 'B', 'C'], 'D', 3)).toEqual(['D', 'A', 'B']);
  });
  it('searches by code, name or symbol', () => {
    expect(currencyMatches('DKK', 'dkk')).toBe(true);
    expect(currencyMatches('DKK', 'danish')).toBe(true);
    expect(currencyMatches('EUR', '€')).toBe(true);
    expect(currencyMatches('EUR', 'krone')).toBe(false);
    expect(currencyMatches('EUR', '')).toBe(true);
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
