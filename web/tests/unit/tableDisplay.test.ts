import { describe, it, expect } from 'vitest';
import { cardsAvailability, cardsRows, cardValueNumber, CARDS_MAX_ROWS } from '../../src/utils/tableDisplay';

const grid = (...rows: string[][]) => rows;

describe('cardValueNumber', () => {
  it('reads plain numbers, currency and percentages', () => {
    expect(cardValueNumber('1,240')).toBe(1240);
    expect(cardValueNumber('€1.24M')).toBe(1240000);
    expect(cardValueNumber('12%')).toBe(12);
  });
  it('allows a one-word unit and a leading comparator', () => {
    expect(cardValueNumber('3.2 h')).toBe(3.2);
    expect(cardValueNumber('6 days')).toBe(6);
    expect(cardValueNumber('<2s')).toBe(2);
    expect(cardValueNumber('≥ 99.9%')).toBe(99.9);
  });
  it('rejects text, dates and codes', () => {
    expect(cardValueNumber('On track')).toBeNull();
    expect(cardValueNumber('2026-10-14')).toBeNull();
    expect(cardValueNumber('Q4')).toBeNull();
    expect(cardValueNumber('3 of 5')).toBeNull();
    expect(cardValueNumber('')).toBeNull();
  });
});

describe('cardsAvailability', () => {
  const two = grid(['Metric', 'Value'], ['Revenue', '€1.2M'], ['Users', '8,420']);

  it('accepts label · value tables', () => {
    expect(cardsAvailability(two)).toEqual({ ok: true });
    expect(cardsAvailability(grid(['Area', 'Effort'], ['ERP', '6 days'], ['Total', '31 days'])).ok).toBe(true);
  });

  it('needs 2 or 3 columns', () => {
    const one = cardsAvailability(grid(['Value'], ['1'], ['2']));
    expect(one.ok).toBe(false);
    expect(one.reason).toContain('This table has 1');
    expect(cardsAvailability(grid(['A', 'B', 'C', 'D'], ['x', '1', '+1', '2'], ['y', '2', '-1', '3'])).ok).toBe(false);
  });

  it('needs 2 to 8 rows, ignoring empty rows', () => {
    expect(cardsAvailability(grid(['M', 'V'], ['A', '1'], ['', ''])).reason).toContain('at least 2 rows');
    const rows = Array.from({ length: CARDS_MAX_ROWS }, (_, i) => ['R' + i, String(i)]);
    expect(cardsAvailability([['M', 'V'], ...rows]).ok).toBe(true);
    const tooMany = cardsAvailability([['M', 'V'], ...rows, ['Extra', '9']]);
    expect(tooMany.ok).toBe(false);
    expect(tooMany.reason).toContain('up to 8 rows');
  });

  it('needs numbers in the second column for at least half its filled cells', () => {
    expect(cardsAvailability(grid(['Code', 'Name'], ['ZN', 'Night'], ['ZD', 'Day'])).ok).toBe(false);
    expect(cardsAvailability(grid(['M', 'V'], ['A', '10'], ['B', 'pending'])).ok).toBe(true);
    expect(cardsAvailability(grid(['M', 'V'], ['A', '10'], ['B', 'pending'], ['C', 'late'])).ok).toBe(false);
    // n/a and dashes don't count against it
    expect(cardsAvailability(grid(['M', 'V'], ['A', '10'], ['B', 'n/a'], ['C', '—'])).ok).toBe(true);
  });

  it('accepts a change column written with signs or arrows, with n/a and blanks', () => {
    const t = grid(['Metric', 'Value', 'Change'], ['NPS', '47', '+5'], ['Churn', '2.1%', '-0.4%'], ['Users', '12,480', '▲ 8%'], ['Tickets', '312', 'n/a'], ['Uptime', '99.9%', '0'], ['Response', '3.2 h', '−0.6 h'], ['Other', '1', '']);
    expect(cardsAvailability(t)).toEqual({ ok: true });
  });

  it('accepts a third column that is entirely empty', () => {
    expect(cardsAvailability(grid(['M', 'V', 'Change'], ['A', '1', ''], ['B', '2', ''])).ok).toBe(true);
  });

  it('rejects a third column that is text or a plain quantity', () => {
    const owner = cardsAvailability(grid(['Item', 'Cost', 'Owner'], ['Laptop', '1,200', 'Ana'], ['Desk', '300', 'Ben']));
    expect(owner.ok).toBe(false);
    expect(owner.reason).toContain('third column');
    expect(cardsAvailability(grid(['Item', 'Cost', 'Qty'], ['Laptop', '1,200', '2'], ['Desk', '300', '4'])).ok).toBe(false);
    expect(cardsAvailability(grid(['Item', 'Cost', 'Due'], ['Laptop', '1,200', '2026-10-14'], ['Desk', '300', '+2'])).ok).toBe(false);
  });
});

describe('cardsRows', () => {
  it('returns one card per filled body row', () => {
    expect(cardsRows(grid(['M', 'V'], ['A', '1'], ['', ''], ['B', '2']))).toEqual([
      { label: 'A', value: '1', change: '' },
      { label: 'B', value: '2', change: '' }
    ]);
  });
  it('reads the change column when there are three columns', () => {
    expect(cardsRows(grid(['M', 'V', 'C'], ['A', '1', '+2'], ['B', '2']))).toEqual([
      { label: 'A', value: '1', change: '+2' },
      { label: 'B', value: '2', change: '' }
    ]);
  });
});
