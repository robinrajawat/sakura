import { describe, expect, it } from 'vitest';
import { computeListNumbers, repairTypedNumbers, type TypedNumberRow } from '../../src/utils/listNumbers';

describe('computeListNumbers', () => {
  it('numbers only the direct children of a numbered row', () => {
    const list = [
      { depth: 0, numbered: true },
      { depth: 1 },
      { depth: 2 },
      { depth: 1 },
      { depth: 1 },
      { depth: 0 },
      { depth: 1 },
    ];
    expect(computeListNumbers(list)).toEqual([0, 1, 0, 2, 3, 0, 0]);
  });

  it('starts again at 1 in a nested numbered list', () => {
    const list = [
      { depth: 0, numbered: true },
      { depth: 1, numbered: true },
      { depth: 2 },
      { depth: 2 },
      { depth: 1 },
    ];
    expect(computeListNumbers(list)).toEqual([0, 1, 1, 2, 2]);
  });

  it('gives top-level rows and rows under a plain parent no number', () => {
    expect(computeListNumbers([{ depth: 0 }, { depth: 0 }, { depth: 1 }])).toEqual([0, 0, 0]);
  });

  it('numbers what the list shows when rows are left out', () => {
    // The second child was left out of the export: the third becomes 2.
    expect(computeListNumbers([{ depth: 3, numbered: true }, { depth: 4 }, { depth: 4 }])).toEqual([0, 1, 2]);
  });

  it('tolerates a depth gap', () => {
    expect(computeListNumbers([{ depth: 0, numbered: true }, { depth: 2 }, { depth: 1 }])).toEqual([0, 0, 1]);
  });
});

describe('repairTypedNumbers', () => {
  const rows = (): TypedNumberRow[] => [
    { depth: 0, text: 'Runtime flow' },
    { depth: 1, text: '1. Warehouse document is created', marks: [{ s: 3, e: 12 }] },
    { depth: 2, text: 'detail' },
    { depth: 1, text: '2. EWM determines the process' },
    { depth: 1, text: '3) EWM reads the POSC definition' },
  ];

  it('moves typed numbers off the text and numbers the parent', () => {
    const list = rows();
    expect(repairTypedNumbers(list)).toBe(1);
    expect(list[0].numbered).toBe(true);
    expect(list.map((r) => r.text)).toEqual([
      'Runtime flow', 'Warehouse document is created', 'detail', 'EWM determines the process', 'EWM reads the POSC definition',
    ]);
    expect(list[1].marks).toEqual([{ s: 0, e: 9 }]);
  });

  it('leaves lists that are out of order, partial or single alone', () => {
    const outOfOrder = rows(); outOfOrder[3].text = '5. later';
    expect(repairTypedNumbers(outOfOrder)).toBe(0);
    expect(outOfOrder[1].text).toBe('1. Warehouse document is created');

    const partial = rows(); partial[4].text = 'no number';
    expect(repairTypedNumbers(partial)).toBe(0);

    const single: TypedNumberRow[] = [{ depth: 0, text: 'A' }, { depth: 1, text: '1. only' }];
    expect(repairTypedNumbers(single)).toBe(0);
  });

  it('does not touch years or decimals', () => {
    const list: TypedNumberRow[] = [{ depth: 0, text: 'P' }, { depth: 1, text: '1.5 kg' }, { depth: 1, text: '2026 plan' }];
    expect(repairTypedNumbers(list)).toBe(0);
  });

  it('drops a mark that only covered the number', () => {
    const list: TypedNumberRow[] = [
      { depth: 0, text: 'P' },
      { depth: 1, text: '1. a', marks: [{ s: 0, e: 2 }] },
      { depth: 1, text: '2. b' },
    ];
    repairTypedNumbers(list);
    expect(list[1].marks).toEqual([]);
  });
});
