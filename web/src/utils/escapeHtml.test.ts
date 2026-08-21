import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

// A literal re-implementation of index.html's current esc(), kept ONLY as a local oracle in
// this test file to assert byte-for-byte equivalence against the extracted version — this is
// not a real second implementation to maintain, just a pinned copy of what's live today so a
// future accidental behavior change in escapeHtml.ts gets caught immediately. If index.html's
// esc() is ever intentionally changed, this line must be updated to match, deliberately, in
// the same change.
function originalEsc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

describe('escapeHtml', () => {
  it('escapes ampersand, less-than, greater-than', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('does NOT escape quotes (matches index.html esc(), intentionally incomplete)', () => {
    expect(escapeHtml(`it's "quoted"`)).toBe(`it's "quoted"`);
  });

  it('handles an already-escaped entity without double-escaping the ampersand incorrectly', () => {
    // Same behavior as the original: &amp; becomes &amp;amp; (single-pass replace, not
    // entity-aware) — preserved exactly, not "fixed", per the extraction rules above.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('coerces non-string input the same way String() does', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
    expect(escapeHtml(true)).toBe('true');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('handles a string with no special characters unchanged', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });

  it('handles repeated/adjacent special characters', () => {
    expect(escapeHtml('<<<>>>&&&')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;');
  });

  it('handles a realistic XSS payload the same way the original does (escapes tag delimiters)', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('handles unicode content unchanged aside from the three escaped characters', () => {
    expect(escapeHtml('日本語 <タグ> & émoji 🎉')).toBe('日本語 &lt;タグ&gt; &amp; émoji 🎉');
  });

  // Property-style equivalence check against the pinned original, across a spread of inputs —
  // catches any future accidental drift between the two beyond the specific cases above.
  it('matches the pinned original esc() across a range of inputs', () => {
    const cases = [
      'hello world',
      '<div class="x">&amp;</div>',
      '',
      '   ',
      '&<><<>>&&',
      'a'.repeat(1000) + '<>&',
      '中文 & 日本語 < > 🚀',
      '\n\t special \r\n whitespace &',
    ];
    for (const c of cases) {
      expect(escapeHtml(c)).toBe(originalEsc(c));
    }
  });
});
