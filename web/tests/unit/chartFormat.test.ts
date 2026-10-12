import { describe, it, expect } from 'vitest';
import {
  niceAxisScale, formatChartNumber, cardsGridColumns, cardChangeDirection, cardChangeText,
  valuesLookLikeFractions, progressPercent, heatLevels, timelineOrder, timelinePhases,
  statusGroup, findStatusColumn, boardLanes, statusPickerOptions
} from '../../src/utils/chartFormat';

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


describe('progress bars', () => {
  it('tells fractions from percentages', () => {
    expect(valuesLookLikeFractions([0.25, 0.8, 1])).toBe(true);
    expect(valuesLookLikeFractions([25, 80])).toBe(false);
    expect(valuesLookLikeFractions([0, 1])).toBe(false);
    expect(valuesLookLikeFractions([null])).toBe(false);
  });
  it('computes the fill from a percentage, a fraction or value ÷ target', () => {
    expect(progressPercent(62, null)).toBe(62);
    expect(progressPercent(0.62, null, true)).toBeCloseTo(62);
    expect(progressPercent(31, 50)).toBe(62);
    expect(progressPercent(140, null)).toBe(100);
    expect(progressPercent(-5, null)).toBe(0);
  });
  it('has nothing to show without a number or with a zero target', () => {
    expect(progressPercent(null, null)).toBeNull();
    expect(progressPercent(5, 0)).toBeNull();
  });
});

describe('heatLevels', () => {
  it('spreads a column over levels 1..5', () => {
    expect(heatLevels([0, 25, 50, 75, 100])).toEqual([1, 2, 3, 4, 5]);
    expect(heatLevels([10, null, 30])).toEqual([1, null, 5]);
  });
  it('reverses for columns where less is better', () => {
    expect(heatLevels([0, 100], true)).toEqual([5, 1]);
  });
  it('leaves columns with nothing to compare unshaded', () => {
    expect(heatLevels([7, 7, 7])).toEqual([null, null, null]);
    expect(heatLevels([7, null])).toEqual([null, null]);
  });
});

describe('timeline', () => {
  it('orders dated rows chronologically, undated rows last in table order', () => {
    expect(timelineOrder([30, null, 10, 20, null])).toEqual([2, 3, 0, 1, 4]);
    expect(timelineOrder([5, 5, 1])).toEqual([2, 0, 1]); // ties keep table order
  });
  it('marks past rows done, the first from today next, later ones upcoming', () => {
    const today = Date.UTC(2026, 9, 12);
    const dates = [Date.UTC(2026, 8, 1), Date.UTC(2026, 9, 12), Date.UTC(2026, 10, 1), null];
    expect(timelinePhases(dates, [true, true, true, false], today)).toEqual(['done', 'next', 'upcoming', null]);
  });
  it('gives dates without a year no phase', () => {
    expect(timelinePhases([Date.UTC(2000, 0, 5)], [false], Date.UTC(2026, 0, 1))).toEqual([null]);
  });
});

describe('status board', () => {
  it('recognises common status words, ignoring case, punctuation and emoji', () => {
    expect(['Open', 'To-do', 'IN PROGRESS', 'in-progress', 'On hold', '✅ Done', 'Closed.', 'Cancelled', ''].map(statusGroup))
      .toEqual(['open', 'open', 'progress', 'progress', 'blocked', 'done', 'done', null, null]);
  });
  it('finds the status column by header, else by its values', () => {
    expect(findStatusColumn(['Item', 'Owner', 'Status'], [['a', 'b'], ['x', 'y'], ['', '']])).toBe(2);
    expect(findStatusColumn(['Item', 'State '], [[], []])).toBe(1);
    expect(findStatusColumn(['Item', 'Where'], [['a', 'b', 'c'], ['Done', 'Open', 'Phase 2']])).toBe(1);
    expect(findStatusColumn(['Item', 'Where'], [['a', 'b'], ['Paris', 'Open']])).toBe(-1);
  });
  it('groups rows into lanes: standard ones, then others, then Done, then No status', () => {
    const lanes = boardLanes(['Done', 'Open', 'Cancelled', '', 'Blocked', 'open', 'cancelled']);
    expect(lanes.map((l) => [l.label, l.rows])).toEqual([
      ['Open', [1, 5]], ['Blocked', [4]], ['Cancelled', [2, 6]], ['Done', [0]], ['No status', [3]]
    ]);
  });
});

describe('statusPickerOptions', () => {
  it('offers the standard four, then the column\'s own other statuses', () => {
    expect(statusPickerOptions(['done', 'Cancelled', '', 'cancelled', 'Parked'])).toEqual(['Open', 'In progress', 'Blocked', 'Done', 'Cancelled', 'Parked']);
  });
});
