import { describe, it, expect } from 'vitest';
import { wrapLineCount, pptxLineHeightIn } from './wrapLineCount';

// Deterministic fake measurer: every character is 5px wide, matching a monospace-like model --
// makes the wrap math predictable to assert on without any real font/canvas involved.
const fakeMeasure = (s: string) => s.length * 5;

describe('wrapLineCount', () => {
  it('returns 1 for text that fits entirely on one line', () => {
    expect(wrapLineCount('short text', 1000, fakeMeasure)).toBe(1);
  });

  it('returns 1 for empty/whitespace-only text', () => {
    expect(wrapLineCount('', 100, fakeMeasure)).toBe(1);
    expect(wrapLineCount('   ', 100, fakeMeasure)).toBe(1);
  });

  it('wraps onto a second line once a word would overflow the box width', () => {
    // "aaaaa bbbbb" = 5*5 + 5(space) + 5*5 = 55px wide as one line.
    // A 40px box fits "aaaaa" (25px) but not "aaaaa bbbbb" (55px) -> wraps to 2 lines.
    expect(wrapLineCount('aaaaa bbbbb', 40, fakeMeasure)).toBe(2);
  });

  it('never wraps the first word on a line away, even if wider than the box', () => {
    // A single word wider than boxWidthPx still counts as exactly 1 line (matches legacy's own
    // lineW>0 guard -- wrapping only ever happens BEFORE adding a word to a non-empty line).
    expect(wrapLineCount('aaaaaaaaaaaaaaaaaaaa', 10, fakeMeasure)).toBe(1);
  });

  it('counts multiple wraps across a long run of words', () => {
    // 6 words of "aaaaa" (25px each) + spaces (5px): with a box that fits exactly 2 words per
    // line (25+5+25=55px), 6 words wrap into 3 lines.
    expect(wrapLineCount('aaaaa aaaaa aaaaa aaaaa aaaaa aaaaa', 55, fakeMeasure)).toBe(3);
  });

  it('treats multiple consecutive spaces/newlines as ordinary word separators', () => {
    expect(wrapLineCount('one   two\nthree', 1000, fakeMeasure)).toBe(1);
  });
});

describe('pptxLineHeightIn', () => {
  it('scales font size (in points) to inches at the default 1.25 line-spacing multiple', () => {
    expect(pptxLineHeightIn(16)).toBeCloseTo((16 * 1.25) / 72);
  });

  it('honors an explicit line-spacing multiple', () => {
    expect(pptxLineHeightIn(14, 1.3)).toBeCloseTo((14 * 1.3) / 72);
  });
});
