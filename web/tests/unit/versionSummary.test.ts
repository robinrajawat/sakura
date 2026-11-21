import { describe, it, expect } from 'vitest';
import { summarizeVersionChange, formatVersionSummary, describeDevice, formatVersionTime } from '../../src/utils/versionSummary';

const row = (id: number, text: string, extra: object = {}) => ({ id, text, depth: 0, note: '', tables: [], images: [], ...extra });

describe('summarizeVersionChange', () => {
  it('counts rows added, removed, edited and moved by id', () => {
    const older = { nodes: [row(1, 'a'), row(2, 'b'), row(3, 'c'), row(4, 'd')] };
    const newer = { nodes: [row(1, 'a'), row(2, 'B'), row(3, 'c', { depth: 1 }), row(5, 'e'), row(6, 'f')] };
    const c = summarizeVersionChange(older, newer);
    expect([c.rowsAdded, c.rowsRemoved, c.rowsEdited, c.rowsMoved]).toEqual([2, 1, 1, 1]);
    expect(formatVersionSummary(c)).toBe('2 rows added · 1 row removed · 1 row edited · 1 row moved');
  });

  it('a note, table or tick is an edit too', () => {
    const c = summarizeVersionChange({ nodes: [row(1, 'a'), row(2, 'b'), row(3, 'c')] },
      { nodes: [row(1, 'a', { note: 'x' }), row(2, 'b', { tables: [{}] }), row(3, 'c', { checked: true })] });
    expect(c.rowsEdited).toBe(3);
  });

  it('thread entries, title and status', () => {
    const c = summarizeVersionChange({ title: 'A', docStatus: '', remarks: [{ id: 'x' }, { id: 'y' }] }, { title: 'B', docStatus: 'approved', remarks: [{ id: 'y' }, { id: 'z' }, { id: 'w' }] });
    expect(formatVersionSummary(c)).toBe('2 thread entries added · 1 thread entry removed · title changed · status changed');
  });

  it('nothing changed, and missing lists', () => {
    expect(formatVersionSummary(summarizeVersionChange({ nodes: [row(1, 'a')] }, { nodes: [row(1, 'a')] }))).toBe('No changes to the content');
    expect(formatVersionSummary(summarizeVersionChange(null, { nodes: [row(1, 'a')] }))).toBe('1 row added');
  });
});

describe('describeDevice', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  it('names the device', () => {
    expect(describeDevice(iphone, true)).toBe('iPhone app');
    expect(describeDevice(iphone, false)).toBe('Safari on iPhone');
    expect(describeDevice(mac, false)).toBe('Safari on Mac');
    expect(describeDevice(chromeWin, false)).toBe('Chrome on Windows');
    expect(describeDevice(ipad, false)).toBe('Safari on iPad');
    expect(describeDevice('', false)).toBe('Browser');
  });
});

describe('formatVersionTime', () => {
  const now = new Date(2026, 10, 21, 13, 0).getTime();
  it('today, yesterday, this year, other years', () => {
    expect(formatVersionTime(new Date(2026, 10, 21, 12, 47).getTime(), now, 'en-GB')).toBe('Today, 12:47');
    expect(formatVersionTime(new Date(2026, 10, 20, 16, 55).getTime(), now, 'en-GB')).toBe('Yesterday, 16:55');
    expect(formatVersionTime(new Date(2026, 10, 16, 18, 11).getTime(), now, 'en-GB')).toBe('16 Nov, 18:11');
    expect(formatVersionTime(new Date(2025, 0, 2, 9, 5).getTime(), now, 'en-GB')).toBe('2 Jan 2025, 9:05');
  });
});
