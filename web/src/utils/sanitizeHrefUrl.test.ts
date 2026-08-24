import { describe, it, expect } from 'vitest';
import { sanitizeHrefUrl } from './sanitizeHrefUrl';

describe('sanitizeHrefUrl', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeHrefUrl('')).toBe('');
    expect(sanitizeHrefUrl(null)).toBe('');
    expect(sanitizeHrefUrl(undefined)).toBe('');
  });

  it('passes through normal https/http/mailto URLs unchanged (after trim)', () => {
    expect(sanitizeHrefUrl('  https://example.com  ')).toBe('https://example.com');
    expect(sanitizeHrefUrl('http://example.com')).toBe('http://example.com');
    expect(sanitizeHrefUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('blocks javascript: URLs', () => {
    expect(sanitizeHrefUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeHrefUrl('  JavaScript:alert(1)')).toBe('');
  });

  it('blocks javascript: URLs obfuscated with control characters', () => {
    expect(sanitizeHrefUrl('jav\tascript:alert(1)')).toBe('');
    expect(sanitizeHrefUrl('jav\nascript:alert(1)')).toBe('');
  });
});
