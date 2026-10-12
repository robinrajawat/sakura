import { describe, it, expect } from 'vitest';
import { niceAxisScale, formatChartNumber, cardsGridColumns, cardChangeDirection, cardChangeText } from '../../src/utils/chartFormat';

describe('niceAxisScale', () => {
  it('uses round ticks from 0', () => {
    expect(niceAxisScale(0, 150).ticks).toEqual([0, 50, 100, 150]);
    expect(niceAxisScale(0, 137).ticks).toEqual([0, 50, 100, 150]);
    expect(niceAxisScale(0, 9).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceAxisScale(0, 12500).ticks).toEqual([0, 5000, 10000, 15000]);
  });
  it('always includes 0 so bars start at the baseline', () => {
    const s = niceAxisScale(80, 120);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(120);
  });
  it('covers negative values', () => {
    const s = niceAxisScale(-40, 90);
    expect(s.min).toBeLessThanOrEqual(-40);
    expect(s.max).toBeGreaterThanOrEqual(90);
    expect(s.ticks).toContain(0);
  });
  it('gives an empty or all-zero range a usable axis', () => {
    expect(niceAxisScale(0, 0).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceAxisScale(NaN, NaN).max).toBeGreaterThan(0);
  });
  it('has no floating-point noise', () => {
    niceAxisScale(0, 0.7).ticks.forEach((t) => expect(String(t).length).toBeLessThan(6));
  });
});

describe('formatChartNumber', () => {
  it('adds thousands separators', () => {
    expect(formatChartNumber(12500)).toBe('12,500');
    expect(formatChartNumber(999999)).toBe('999,999');
    expect(formatChartNumber(-1500)).toBe('-1,500');
  });
  it('compacts millions and billions', () => {
    expect(formatChartNumber(1_250_000)).toBe('1.3M');
    expect(formatChartNumber(2_000_000)).toBe('2M');
    expect(formatChartNumber(3_000_000_000)).toBe('3B');
  });
  it('keeps at most two decimals, without trailing zeros', () => {
    expect(formatChartNumber(2.5)).toBe('2.5');
    expect(formatChartNumber(0.125)).toBe('0.13');
    expect(formatChartNumber(7)).toBe('7');
    expect(formatChartNumber(0)).toBe('0');
  });
  it('returns empty text for non-numbers', () => {
    expect(formatChartNumber(NaN)).toBe('');
  });
});

describe('cardsGridColumns', () => {
  it('fills rows evenly, never leaving one card alone', () => {
    expect([1, 2, 3, 4].map(cardsGridColumns)).toEqual([1, 2, 3, 4]);
    expect(cardsGridColumns(5)).toBe(3);
    expect(cardsGridColumns(6)).toBe(3);
    expect(cardsGridColumns(7)).toBe(4);
    expect(cardsGridColumns(8)).toBe(4);
    expect(cardsGridColumns(9)).toBe(3);
    expect(cardsGridColumns(10)).toBe(4);
    expect(cardsGridColumns(0)).toBe(1);
  });
});

describe('cardChangeDirection / cardChangeText', () => {
  it('reads arrows and signs', () => {
    expect(cardChangeDirection('▲ 4', 4)).toBe('up');
    expect(cardChangeDirection('↓2', 2)).toBe('down');
    expect(cardChangeDirection('+12%', 12)).toBe('up');
    expect(cardChangeDirection('-3', -3)).toBe('down');
    expect(cardChangeDirection('0', 0)).toBe('flat');
  });
  it('has no direction for text without a number', () => {
    expect(cardChangeDirection('n/a', null)).toBeNull();
    expect(cardChangeDirection('', null)).toBeNull();
  });
  it('drops the leading arrow or sign from the shown text', () => {
    expect(cardChangeText('+12%')).toBe('12%');
    expect(cardChangeText('▼ 3 pts')).toBe('3 pts');
    expect(cardChangeText('−5')).toBe('5');
    expect(cardChangeText('n/a')).toBe('n/a');
  });
});
