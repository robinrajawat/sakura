import { describe, it, expect } from 'vitest';
import { tableSnapshotKey, fitTableSnapshots, tableSnapshotClass } from '../../src/utils/tableSnapshot';

describe('tableSnapshotKey', () => {
  it('is stable and changes with any edit', () => {
    const t = '<table><tr><th>City</th></tr><tr><td>Oslo</td></tr></table>';
    expect(tableSnapshotKey(t)).toBe(tableSnapshotKey(t));
    expect(tableSnapshotKey(t)).not.toBe(tableSnapshotKey(t.replace('Oslo', 'Olso')));
    expect(tableSnapshotKey(t)).toMatch(/^t[0-9a-z]+_[0-9a-z]+_[0-9a-z]+$/);
  });
});

describe('fitTableSnapshots', () => {
  it('keeps the smaller copies when they do not all fit', () => {
    const items = { a: { cls: '', html: 'x'.repeat(50) }, b: { cls: '', html: 'x'.repeat(500) }, c: { cls: '', html: 'x'.repeat(60) } };
    expect(Object.keys(fitTableSnapshots(items, 300)).sort()).toEqual(['a', 'c']);
    expect(Object.keys(fitTableSnapshots(items)).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('tableSnapshotClass', () => {
  it('passes only the figure classes', () => {
    expect(tableSnapshotClass('pv-table-chart-figure pos-center evil')).toBe('pv-table-chart-figure pos-center');
    expect(tableSnapshotClass(undefined)).toBe('');
  });
});
