import { describe, it, expect } from 'vitest';
import { stripHtmlToText } from './stripHtmlToText';

describe('stripHtmlToText', () => {
  it('returns empty string for falsy input', () => {
    expect(stripHtmlToText('')).toBe('');
    expect(stripHtmlToText(null)).toBe('');
    expect(stripHtmlToText(undefined)).toBe('');
  });

  it('strips tags, keeping text content', () => {
    expect(stripHtmlToText('<p>hello <b>world</b></p>')).toBe('hello world');
  });

  it('collapses whitespace and trims', () => {
    expect(stripHtmlToText('<p>a</p>\n\n<p>  b  </p>')).toBe('a b');
  });

  it('concatenates across block boundaries with no separator (matches legacy)', () => {
    expect(stripHtmlToText('<div>a</div><div>b</div>')).toBe('ab');
  });
});
