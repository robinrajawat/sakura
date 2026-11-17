import { describe, it, expect } from 'vitest';
import { versionCloudRecords, versionsFromCloudRecords, splitText, VERSION_MAX_PARTS, VERSION_PART_MAX_UNITS } from '../../src/utils/versionChunks';

const version = (ts: number, text: string) => ({ ts, reason: 'Auto', nodes: [{ id: 1, text }], title: 'T' });

describe('versionChunks', () => {
  it('a version that fits is one record, as before', () => {
    const recs = versionCloudRecords(version(5, 'small'))!;
    expect(recs).toEqual([{ id: '5', data: { ts: 5, reason: 'Auto', json: JSON.stringify(version(5, 'small')) } }]);
    expect(versionsFromCloudRecords(recs)).toEqual([version(5, 'small')]);
  });

  it('a big version is split and joined back exactly', () => {
    const big = version(7, 'x'.repeat(2_000_000));
    const recs = versionCloudRecords(big)!;
    expect(recs[0]).toEqual({ id: '7', data: { ts: 7, reason: 'Auto', parts: recs.length - 1 } });
    expect(recs.length - 1).toBe(Math.ceil(JSON.stringify(big).length / VERSION_PART_MAX_UNITS));
    expect(recs.slice(1).every((r) => (r.data.json as string).length <= VERSION_PART_MAX_UNITS)).toBe(true);
    // Read back in any order, mixed with other versions.
    const read = versionsFromCloudRecords([...recs].reverse().concat(versionCloudRecords(version(8, 'other'))!));
    expect(read.map((v) => v.ts).sort()).toEqual([7, 8]);
    expect(read.find((v) => v.ts === 7)).toEqual(big);
  });

  it('counts bytes, not characters: text in non-Latin scripts that would pass a character count is split', () => {
    const hindi = version(9, 'नमस्ते'.repeat(60_000)); // ~360k characters, ~1 MB in UTF-8
    expect(JSON.stringify(hindi).length).toBeLessThan(900_000);
    const recs = versionCloudRecords(hindi)!;
    expect(recs.length).toBeGreaterThan(1);
    expect(versionsFromCloudRecords(recs)[0]).toEqual(hindi);
  });

  it('never splits an emoji in half', () => {
    const s = 'a' + '😀'.repeat(10);
    const parts = splitText(s, 4);
    expect(parts.join('')).toBe(s);
    expect(parts.every((p) => !/[\uD800-\uDBFF]$/.test(p) && !/^[\uDC00-\uDFFF]/.test(p))).toBe(true);
  });

  it('a split version missing a part is skipped, not read wrong', () => {
    const recs = versionCloudRecords(version(3, 'y'.repeat(1_000_000)))!;
    expect(versionsFromCloudRecords(recs.filter((r) => r.id !== '3~1'))).toEqual([]);
  });

  it('too big even split: stays on the device', () => {
    expect(versionCloudRecords(version(4, 'z'.repeat(VERSION_PART_MAX_UNITS * (VERSION_MAX_PARTS + 1))))).toBeNull();
  });
});
