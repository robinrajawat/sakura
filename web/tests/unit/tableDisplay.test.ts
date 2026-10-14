import { describe, it, expect } from 'vitest';
import {
  cardsAvailability, cardsChangeColumn, cardsRows, cardValueNumber, CARDS_MAX_ROWS,
  isTotalLabel, typedTotalRowIndex, sumColumn, computeTotalRow, totalRowMismatches, cardsTotal
} from '../../src/utils/tableDisplay';

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

  it('needs 2 to 5 columns', () => {
    const one = cardsAvailability(grid(['Value'], ['1'], ['2']));
    expect(one.ok).toBe(false);
    expect(one.reason).toContain('This table has 1');
    expect(cardsAvailability(grid(['A', 'B', 'C', 'D'], ['x', '1', '+1', '2'], ['y', '2', '-1', '3'])).ok).toBe(true);
    expect(cardsAvailability(grid(['A', 'B', 'C', 'D', 'E', 'F'], ['x', '1', '', '', '', ''], ['y', '2', '', '', '', ''])).ok).toBe(false);
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

  it('accepts a third column that is text or a plain quantity, as a detail line', () => {
    expect(cardsAvailability(grid(['Item', 'Cost', 'Owner'], ['Laptop', '1,200', 'Ana'], ['Desk', '300', 'Ben'])).ok).toBe(true);
    expect(cardsAvailability(grid(['Item', 'Cost', 'Qty'], ['Laptop', '1,200', '2'], ['Desk', '300', '4'])).ok).toBe(true);
  });
});

describe('cardsChangeColumn', () => {
  it('is the first column after the value written as changes', () => {
    expect(cardsChangeColumn(grid(['M', 'V', 'C'], ['A', '1', '+2'], ['B', '2', '▼ 1']))).toBe(2);
    expect(cardsChangeColumn(grid(['M', 'V', 'Note', 'C'], ['A', '1', 'pilot', '+2'], ['B', '2', '', '-1']))).toBe(3);
  });
  it('is -1 for text, plain quantities, dates and empty columns', () => {
    expect(cardsChangeColumn(grid(['I', 'C', 'Owner'], ['L', '1', 'Ana'], ['D', '2', 'Ben']))).toBe(-1);
    expect(cardsChangeColumn(grid(['I', 'C', 'Qty'], ['L', '1', '2'], ['D', '2', '4']))).toBe(-1);
    expect(cardsChangeColumn(grid(['I', 'C', 'Due'], ['L', '1', '2026-10-14'], ['D', '2', '+2']))).toBe(-1);
    expect(cardsChangeColumn(grid(['I', 'C', 'X'], ['L', '1', ''], ['D', '2', '']))).toBe(-1);
  });
});

describe('cardsRows', () => {
  it('returns one card per filled body row', () => {
    expect(cardsRows(grid(['M', 'V'], ['A', '1'], ['', ''], ['B', '2']))).toEqual([
      { label: 'A', value: '1', change: '', details: [] },
      { label: 'B', value: '2', change: '', details: [] }
    ]);
  });
  it('reads the change column when there are three columns', () => {
    expect(cardsRows(grid(['M', 'V', 'C'], ['A', '1', '+2'], ['B', '2']))).toEqual([
      { label: 'A', value: '1', change: '+2', details: [] },
      { label: 'B', value: '2', change: '', details: [] }
    ]);
  });
  it('shows a single text column as an unlabelled note line', () => {
    expect(cardsRows(grid(['Item', 'Amount', 'Note'], ['Special freight', 'DKK 1,500', 'Scales only'], ['Pallets', 'DKK 400', '']))).toEqual([
      { label: 'Special freight', value: 'DKK 1,500', change: '', details: [{ label: '', text: 'Scales only' }] },
      { label: 'Pallets', value: 'DKK 400', change: '', details: [] }
    ]);
  });
  it('labels detail lines with their header when there are two, around a change column', () => {
    expect(cardsRows(grid(['M', 'V', 'Owner', 'Δ', 'Due'], ['A', '1', 'Ana', '+2', 'Fri']))).toEqual([
      { label: 'A', value: '1', change: '+2', details: [{ label: 'Owner', text: 'Ana' }, { label: 'Due', text: 'Fri' }] }
    ]);
  });
});

describe('total row', () => {
  const effort = [
    ['Area', 'Effort'], ['CXP - Frontend/Backend', '15 days'], ['UX/UI', '3 days'], ['ERP - O2C - Functional', '10 days'],
    ['ERP - ABAP', '6 days'], ['EWM - ABAP', '5 days'], ['EWM - Functional', '5 days'], ['nShift', '5 days'], ['Total', '31 days']
  ];

  it('recognises total labels', () => {
    for (const t of ['Total', 'total', 'Totals', 'Grand total', 'Subtotal', 'Sub-total', 'Sum', 'Total:']) expect(isTotalLabel(t)).toBe(true);
    for (const t of ['Total cost', 'Totally', 'Summary', '']) expect(isTotalLabel(t)).toBe(false);
  });

  it('finds a typed total row only as the last filled row', () => {
    expect(typedTotalRowIndex(effort)).toBe(8);
    expect(typedTotalRowIndex([...effort, ['', '']])).toBe(8);
    expect(typedTotalRowIndex([['A', 'B'], ['Total', '1'], ['x', '2']])).toBe(-1);
    expect(typedTotalRowIndex([['A', 'B'], ['x', '2']])).toBe(-1);
  });

  it('adds up a column the way it is written', () => {
    expect(sumColumn(['15 days', '3 days', '10 days'])).toEqual({ value: 28, text: '28 days' });
    expect(sumColumn(['DKK 500.00', 'DKK 500.00', 'DKK 1,500.00'])?.text).toBe('DKK 2,500.00');
    expect(sumColumn(['€12', '€3.5'])?.text).toBe('€15.5');
    expect(sumColumn(['4,000', '7,500'])?.text).toBe('11,500');
    expect(sumColumn(['10', '-4', 'n/a', ''])?.text).toBe('6');
    expect(sumColumn(['1 day', '2 days'])?.text).toBe('3 days');
    expect(sumColumn(['0.5 day', '0.5 day'])?.text).toBe('1.0 day');
  });

  it('refuses columns that are not one kind of number', () => {
    expect(sumColumn(['Ana', 'Ben'])).toBeNull();
    expect(sumColumn(['5 days', '3 h'])).toBeNull();
    expect(sumColumn(['40%', '60%'])).toBeNull();
    expect(sumColumn(['1.2k', '3k'])).toBeNull();
    expect(sumColumn(['', 'n/a'])).toBeNull();
  });

  it('computes the total row, leaving a typed total out of the sum', () => {
    const t = computeTotalRow(effort);
    expect(t.cells).toEqual(['Total', '49 days']);
    expect(t.any).toBe(true);
    expect(computeTotalRow([['Code', 'Name'], ['ZN', 'Night']]).any).toBe(false);
  });

  it('reports a typed total that no longer matches its rows', () => {
    expect(totalRowMismatches(effort)).toEqual([{ col: 1, typed: '31 days', computed: '49 days' }]);
    const fixed = effort.map((r) => (r[0] === 'Total' ? ['Total', '49 days'] : r));
    expect(totalRowMismatches(fixed)).toEqual([]);
  });
});

describe('Cards and the total row', () => {
  const g = [['Area', 'Effort'], ['A', '15 days'], ['B', '3 days'], ['Total', '10 days']];
  it('leaves a typed total out of the cards and of the row limit', () => {
    expect(cardsRows(g).map((c) => c.label)).toEqual(['A', 'B']);
    const nine = [['M', 'V'], ...Array.from({ length: 8 }, (_, i) => ['R' + i, String(i)]), ['Total', '28']];
    expect(cardsAvailability(nine).ok).toBe(true);
  });
  it('gives the total card: typed as written, or calculated', () => {
    expect(cardsTotal(g, false)).toEqual({ label: 'Total', value: '10 days', change: '', details: [] });
    expect(cardsTotal(g, true)).toEqual({ label: 'Total', value: '18 days', change: '', details: [] });
    expect(cardsTotal([['M', 'V'], ['A', '1']], false)).toBeNull();
  });
});
