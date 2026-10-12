import { describe, it, expect } from 'vitest';
import {
  parseCellNumber,
  parseCellDate,
  compareCellText,
  tableSortOrder,
  isNumericColumn,
  normalizeAlign,
  looksLikeSpreadsheetText,
  parseTsv,
  gridSizeForPaste,
  clampGridSize
} from '../../src/utils/tableData';

describe('parseCellNumber', () => {
  it('reads plain, signed and decimal numbers', () => {
    expect(parseCellNumber('10')).toBe(10);
    expect(parseCellNumber(' -3.5 ')).toBe(-3.5);
    expect(parseCellNumber('+7')).toBe(7);
    expect(parseCellNumber('.5')).toBe(0.5);
    expect(parseCellNumber('−4')).toBe(-4);
  });
  it('accepts thousands separators, currency, percent and accounting negatives', () => {
    expect(parseCellNumber('1,234,567.89')).toBe(1234567.89);
    expect(parseCellNumber('$1,200')).toBe(1200);
    expect(parseCellNumber('-$12.50')).toBe(-12.5);
    expect(parseCellNumber('$-12.50')).toBe(-12.5);
    expect(parseCellNumber('€ 30')).toBe(30);
    expect(parseCellNumber('30 €')).toBe(30);
    expect(parseCellNumber('12.5%')).toBe(12.5);
    expect(parseCellNumber('-4 %')).toBe(-4);
    expect(parseCellNumber('(1,234)')).toBe(-1234);
    expect(parseCellNumber('1.2k')).toBe(1200);
    expect(parseCellNumber('3M')).toBe(3e6);
  });
  it('rejects text, dates, malformed separators and empties', () => {
    for (const s of ['', '  ', 'abc', 'Q1', 'Oct 14', '2026-10-14', '1,23', '12,34,567', '1.2.3', '$', '%', '-', '+-5', '5 apples', '<2s', '10/14']) {
      expect(parseCellNumber(s), s).toBeNull();
    }
  });
});

describe('parseCellDate', () => {
  it('reads ISO dates with optional time', () => {
    expect(parseCellDate('2026-10-14')).toBe(Date.UTC(2026, 9, 14));
    expect(parseCellDate('2026/1/5')).toBe(Date.UTC(2026, 0, 5));
    expect(parseCellDate('2026-10-14T09:30')).toBe(Date.UTC(2026, 9, 14, 9, 30));
    expect(parseCellDate('2026-10-14T09:30:15Z')).toBe(Date.UTC(2026, 9, 14, 9, 30, 15));
  });
  it('reads month-name dates in either order, with or without a year', () => {
    expect(parseCellDate('Oct 14')).toBe(Date.UTC(2000, 9, 14));
    expect(parseCellDate('October 14, 2026')).toBe(Date.UTC(2026, 9, 14));
    expect(parseCellDate('14 Oct')).toBe(Date.UTC(2000, 9, 14));
    expect(parseCellDate('14 Oct 2026')).toBe(Date.UTC(2026, 9, 14));
    expect(parseCellDate('Sept 3')).toBe(Date.UTC(2000, 8, 3));
    expect(parseCellDate('Tue, Oct 14')).toBe(Date.UTC(2000, 9, 14));
    expect(parseCellDate('Oct 2026')).toBe(Date.UTC(2026, 9, 1));
    expect(parseCellDate('Feb 29')).toBe(Date.UTC(2000, 1, 29));
  });
  it('rejects non-dates and impossible dates', () => {
    for (const s of ['', 'Octopus 3', 'Oct 32', '2026-02-30', '2026-13-01', '10/14/2026', 'Login', '14', 'Ma 3']) {
      expect(parseCellDate(s), s).toBeNull();
    }
  });
});

describe('compareCellText / tableSortOrder', () => {
  const sorted = (vals: string[], dir: 1 | -1 = 1) => tableSortOrder(vals, dir).map((i) => vals[i]);
  it('sorts numbers numerically, not as text', () => {
    expect(sorted(['10', '9', '100', '-2'])).toEqual(['-2', '9', '10', '100']);
    expect(sorted(['10%', '9%', '12.5%'])).toEqual(['9%', '10%', '12.5%']);
    expect(sorted(['$1,200', '$950', '($50)'])).toEqual(['($50)', '$950', '$1,200']);
  });
  it('sorts dates chronologically', () => {
    expect(sorted(['Nov 3', 'Oct 14', 'Oct 2', 'Jan 9'])).toEqual(['Jan 9', 'Oct 2', 'Oct 14', 'Nov 3']);
    expect(sorted(['2026-10-14', '2025-12-31', '2026-01-02'])).toEqual(['2025-12-31', '2026-01-02', '2026-10-14']);
  });
  it('sorts text naturally and case-insensitively', () => {
    expect(sorted(['banana', 'Apple', 'cherry'])).toEqual(['Apple', 'banana', 'cherry']);
    expect(sorted(['Item 10', 'Item 9', 'Item 1'])).toEqual(['Item 1', 'Item 9', 'Item 10']);
  });
  it('reverses for Z→A but keeps empty cells last either way', () => {
    expect(sorted(['2', '', '10', '1'], -1)).toEqual(['10', '2', '1', '']);
    expect(sorted(['', 'b', 'a'], 1)).toEqual(['a', 'b', '']);
  });
  it('ranks numbers before dates before text', () => {
    expect(sorted(['zeta', 'Oct 1', '5'])).toEqual(['5', 'Oct 1', 'zeta']);
    expect(compareCellText('5', 'zeta')).toBeLessThan(0);
  });
  it('is stable for equal values', () => {
    expect(tableSortOrder(['a', 'A', 'a'])).toEqual([0, 1, 2]);
    expect(tableSortOrder(['a', 'A', 'a'], -1)).toEqual([0, 1, 2]);
  });
});

describe('isNumericColumn', () => {
  it('is true when every non-empty value is numeric', () => {
    expect(isNumericColumn(['1', '', '$2,000', '-3%'])).toBe(true);
  });
  it('is false for any text, or for an all-empty column', () => {
    expect(isNumericColumn(['1', 'n/a'])).toBe(false);
    expect(isNumericColumn(['', ' '])).toBe(false);
    expect(isNumericColumn([])).toBe(false);
    expect(isNumericColumn(['Oct 14'])).toBe(false);
  });
});

describe('normalizeAlign', () => {
  it('keeps only left/center/right', () => {
    expect(normalizeAlign('Right')).toBe('right');
    expect(normalizeAlign('center')).toBe('center');
    expect(normalizeAlign('justify')).toBe('');
    expect(normalizeAlign(null)).toBe('');
  });
});

describe('parseTsv', () => {
  it('splits rows and columns, dropping the trailing newline', () => {
    expect(parseTsv('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseTsv('a\tb\r\n1\t2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps empty cells and pads ragged rows', () => {
    expect(parseTsv('a\t\tc\nx')).toEqual([['a', '', 'c'], ['x', '', '']]);
    expect(parseTsv('\tb')).toEqual([['', 'b']]);
  });
  it('unquotes Excel-quoted cells containing tabs, newlines and quotes', () => {
    expect(parseTsv('"line 1\nline 2"\tb\n"say ""hi"""\t"x\ty"')).toEqual([['line 1\nline 2', 'b'], ['say "hi"', 'x\ty']]);
  });
  it('treats a stray quote literally', () => {
    expect(parseTsv('5" screen\tok')).toEqual([['5" screen', 'ok']]);
    expect(parseTsv('"open\tx')).toEqual([['"open', 'x']]);
  });
  it('returns nothing for empty input', () => {
    expect(parseTsv('')).toEqual([]);
  });
});

describe('looksLikeSpreadsheetText / gridSizeForPaste / clampGridSize', () => {
  it('detects tab-separated text', () => {
    expect(looksLikeSpreadsheetText('a\tb')).toBe(true);
    expect(looksLikeSpreadsheetText('just words')).toBe(false);
    expect(looksLikeSpreadsheetText('two\nlines')).toBe(false);
  });
  it('grows the grid only where a paste runs past it', () => {
    expect(gridSizeForPaste(3, 2, 1, 1, 4, 3)).toEqual({ rows: 5, cols: 4 });
    expect(gridSizeForPaste(5, 5, 0, 0, 2, 2)).toEqual({ rows: 5, cols: 5 });
  });
  it('clamps picker sizes', () => {
    expect(clampGridSize(0, 12)).toEqual({ rows: 1, cols: 8 });
    expect(clampGridSize(3.4, NaN)).toEqual({ rows: 3, cols: 1 });
    expect(clampGridSize(10, 10, 10)).toEqual({ rows: 10, cols: 10 });
  });
});
