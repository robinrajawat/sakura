import { describe, it, expect } from 'vitest';
import { sanitizeRichHtml } from './sanitizeRichHtml';

describe('sanitizeRichHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeRichHtml('')).toBe('');
    expect(sanitizeRichHtml(null)).toBe('');
    expect(sanitizeRichHtml(undefined)).toBe('');
  });

  it('passes through safe formatting markup unchanged', () => {
    expect(sanitizeRichHtml('<b>hi</b> <i>there</i>')).toBe('<b>hi</b> <i>there</i>');
  });

  it('removes blocked tags entirely, including their content', () => {
    expect(sanitizeRichHtml('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>');
    expect(sanitizeRichHtml('<iframe src="x"></iframe>ok')).toBe('ok');
    expect(sanitizeRichHtml('<style>body{color:red}</style>ok')).toBe('ok');
  });

  it('strips event handler attributes', () => {
    expect(sanitizeRichHtml('<img src="x.png" onerror="alert(1)">')).toBe('<img src="x.png">');
    expect(sanitizeRichHtml('<div onclick="bad()">x</div>')).toBe('<div>x</div>');
  });

  it('strips javascript: URLs from href/src/action/formaction', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichHtml('<img src="javascript:alert(1)">')).toBe('<img>');
  });

  it('strips javascript: URLs even with control-character obfuscation', () => {
    expect(sanitizeRichHtml('<a href="jav\tascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('keeps normal http(s) hrefs', () => {
    expect(sanitizeRichHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
  });

  it('strips dangerous style attribute values', () => {
    expect(sanitizeRichHtml('<div style="color:expression(alert(1))">x</div>')).toBe('<div>x</div>');
  });

  it('fails closed on malformed input that would throw', () => {
    // innerHTML assignment itself rarely throws in jsdom, but the try/catch should still
    // return '' rather than propagate if it ever does.
    expect(() => sanitizeRichHtml('<div>unclosed')).not.toThrow();
  });
});
