import { describe, it, expect } from 'vitest';
import {
  diagramGenHardTruncateCore,
  diagramGenLightenCore,
  diagramGenAdjustDimsForShapeCore,
  diagramGenBoxDimsCore,
  diagramGenMergedBoxDimsCore,
  type BoxDims
} from './diagramGenDims';

// Pinned local oracle — literal copy of index.html's current diagramGen* functions, same
// approach as nodeSearch.test.ts. Constants match index.html's own DIAGRAM_GEN_* values.
const O_MIN_W = 140, O_MAX_W = 260, O_PAD = 24, O_CHAR_PX = 7;
const O_ONE_LINE_H = 44, O_TWO_LINE_H = 64;

function oHardTruncate(text: string, budget: number): string {
  const plain = String(text || '').trim();
  if (plain.length <= budget) return plain;
  let cut = plain.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 15) cut = cut.slice(0, lastSpace);
  return cut + '\u2026';
}

function oLighten(hex: string, amount: number): string {
  const h = String(hex || '').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return '#' + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function oAdjustDimsForShape(dims: BoxDims, shape: string): BoxDims {
  if (shape === 'decision') return { w: Math.round(dims.w * 1.45), h: Math.round(dims.h * 1.6) };
  if (shape === 'actor') return { w: 70, h: 86 };
  if (shape === 'datastore') return { w: dims.w, h: dims.h + 16 };
  return dims;
}

function oBoxDims(text: string): BoxDims {
  const len = String(text || '').length;
  const w = Math.min(O_MAX_W, Math.max(O_MIN_W, len * O_CHAR_PX + O_PAD));
  const perLine = Math.max(1, Math.floor((w - O_PAD) / O_CHAR_PX));
  const lines = Math.max(1, Math.ceil(len / perLine));
  return { w, h: lines >= 2 ? O_TWO_LINE_H : O_ONE_LINE_H };
}

function oMergedBoxDims(titleText: string, detailText: string): BoxDims {
  const t = oBoxDims(titleText), d = oBoxDims(detailText);
  return { w: Math.max(t.w, d.w), h: t.h + d.h - 8 };
}

describe('diagramGenHardTruncateCore', () => {
  it('returns text unchanged when already within budget', () => {
    expect(diagramGenHardTruncateCore('short', 20)).toBe('short');
  });

  it('trims and appends ellipsis when over budget', () => {
    expect(diagramGenHardTruncateCore('a fairly long label indeed', 15)).toBe('a fairly long \u2026');
  });

  it('breaks on the last space only when it is past position 15', () => {
    // 'abcdefghijklmnop qrstuvwxyz' — last space at index 16, past the >15 threshold.
    const text = 'abcdefghijklmnop qrstuvwxyz';
    expect(diagramGenHardTruncateCore(text, 20)).toBe('abcdefghijklmnop\u2026');
  });

  it('does not break on a space at or before position 15 (mid-word cut instead)', () => {
    // 'short one longwordwithnospace' — first space at index 5, well under 15, so no
    // space-based break happens within a tight budget slice.
    const text = 'shortlongwordwithnospaceandmore';
    const budget = 10;
    const result = diagramGenHardTruncateCore(text, budget);
    expect(result).toBe(text.slice(0, budget - 1) + '\u2026');
  });

  it('treats a missing/undefined text as an empty string, never throws', () => {
    expect(() => diagramGenHardTruncateCore(undefined as unknown as string, 10)).not.toThrow();
    expect(diagramGenHardTruncateCore(undefined as unknown as string, 10)).toBe('');
  });

  it('trims leading/trailing whitespace before measuring', () => {
    expect(diagramGenHardTruncateCore('   padded text   ', 20)).toBe('padded text');
  });

  it.each([
    ['exact fit', 9],
    ['a fairly long diagram node label', 12],
    ['a fairly long diagram node label', 40],
    ['', 5],
    ['nospacesatallinthisstring', 10]
  ])('matches the oracle: %j budget=%i', (text, budget) => {
    expect(diagramGenHardTruncateCore(text, budget)).toBe(oHardTruncate(text, budget));
  });
});

describe('diagramGenLightenCore', () => {
  it('blends a color toward white by the given amount', () => {
    expect(diagramGenLightenCore('#000000', 0.5)).toBe('#808080');
  });

  it('returns the color unchanged at amount 0', () => {
    expect(diagramGenLightenCore('#123456', 0)).toBe('#123456');
  });

  it('returns white at amount 1', () => {
    expect(diagramGenLightenCore('#123456', 1)).toBe('#ffffff');
  });

  it('handles hex strings with or without a leading #', () => {
    expect(diagramGenLightenCore('123456', 0.5)).toBe(diagramGenLightenCore('#123456', 0.5));
  });

  it('returns the input unchanged when it does not parse as a hex color', () => {
    expect(diagramGenLightenCore('not-a-color', 0.5)).toBe('not-a-color');
    expect(diagramGenLightenCore('', 0.5)).toBe('');
  });

  it.each([
    ['#534AB7', 0.3],
    ['#0F6E56', 0.6],
    ['#A32D2D', 0.9],
    ['#ffffff', 0.5],
    ['#000000', 0]
  ])('matches the oracle: %s amount=%f', (hex, amount) => {
    expect(diagramGenLightenCore(hex, amount)).toBe(oLighten(hex, amount));
  });
});

describe('diagramGenAdjustDimsForShapeCore', () => {
  const base: BoxDims = { w: 200, h: 44 };

  it('scales up for decision shape (1.45x width, 1.6x height, rounded)', () => {
    expect(diagramGenAdjustDimsForShapeCore(base, 'decision')).toEqual({ w: 290, h: 70 });
  });

  it('returns a fixed compact size for actor, ignoring input dims', () => {
    expect(diagramGenAdjustDimsForShapeCore(base, 'actor')).toEqual({ w: 70, h: 86 });
    expect(diagramGenAdjustDimsForShapeCore({ w: 999, h: 999 }, 'actor')).toEqual({ w: 70, h: 86 });
  });

  it('adds 16 to height for datastore, keeps width', () => {
    expect(diagramGenAdjustDimsForShapeCore(base, 'datastore')).toEqual({ w: 200, h: 60 });
  });

  it('passes dims through unchanged for a plain box or unknown shape', () => {
    expect(diagramGenAdjustDimsForShapeCore(base, 'box')).toEqual(base);
    expect(diagramGenAdjustDimsForShapeCore(base, 'unknown-shape')).toEqual(base);
    expect(diagramGenAdjustDimsForShapeCore(base, '')).toEqual(base);
  });

  it.each([
    [{ w: 140, h: 44 }, 'decision'],
    [{ w: 260, h: 64 }, 'datastore'],
    [{ w: 180, h: 44 }, 'actor'],
    [{ w: 220, h: 64 }, 'container']
  ])('matches the oracle: %j shape=%s', (dims, shape) => {
    expect(diagramGenAdjustDimsForShapeCore(dims as BoxDims, shape as string)).toEqual(
      oAdjustDimsForShape(dims as BoxDims, shape as string)
    );
  });
});

describe('diagramGenBoxDimsCore', () => {
  it('uses the one-line height for short labels', () => {
    expect(diagramGenBoxDimsCore('Short')).toEqual({ w: 140, h: 44 });
  });

  it('caps width at the max even for very long labels', () => {
    const result = diagramGenBoxDimsCore('a'.repeat(200));
    expect(result.w).toBe(260);
  });

  it('never goes below the min width for very short/empty labels', () => {
    expect(diagramGenBoxDimsCore('').w).toBe(140);
    expect(diagramGenBoxDimsCore('x').w).toBe(140);
  });

  it('steps up to two-line height once the label needs to wrap at max width', () => {
    const long = 'This label is definitely long enough to require wrapping onto two lines';
    expect(diagramGenBoxDimsCore(long).h).toBe(64);
  });

  it('treats a missing/undefined text as an empty string, never throws', () => {
    expect(() => diagramGenBoxDimsCore(undefined as unknown as string)).not.toThrow();
    expect(diagramGenBoxDimsCore(undefined as unknown as string)).toEqual({ w: 140, h: 44 });
  });

  it.each([
    '',
    'x',
    'A medium length node label here',
    'A very long node label that will definitely need to wrap across two full lines of text',
    'a'.repeat(50)
  ])('matches the oracle: %j', (text) => {
    expect(diagramGenBoxDimsCore(text)).toEqual(oBoxDims(text));
  });
});

describe('diagramGenMergedBoxDimsCore', () => {
  it('width is the wider of title/detail, height is their heights combined minus 8', () => {
    const result = diagramGenMergedBoxDimsCore('Short', 'Also short');
    expect(result).toEqual({ w: 140, h: 44 + 44 - 8 });
  });

  it('picks up the wider line when title and detail differ in required width', () => {
    const longDetail = 'a'.repeat(100);
    const result = diagramGenMergedBoxDimsCore('Short', longDetail);
    expect(result.w).toBe(oBoxDims(longDetail).w);
  });

  it('reflects a two-line detail in the combined height', () => {
    const longDetail = 'This detail line is long enough to require wrapping onto two lines';
    const result = diagramGenMergedBoxDimsCore('Title', longDetail);
    expect(result.h).toBe(44 + 64 - 8);
  });

  it.each([
    ['Title', 'Detail'],
    ['', ''],
    ['A longer title line here', 'A much longer detail line that will need to wrap eventually'],
    ['x', 'a'.repeat(80)]
  ])('matches the oracle: title=%j detail=%j', (title, detail) => {
    expect(diagramGenMergedBoxDimsCore(title, detail)).toEqual(oMergedBoxDims(title, detail));
  });
});
