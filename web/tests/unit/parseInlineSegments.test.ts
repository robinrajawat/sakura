import { describe, it, expect } from 'vitest';
import { parseInlineSegmentsCore } from '../../src/utils/parseInlineSegments';

describe('parseInlineSegmentsCore', () => {
  it('returns an empty array for empty/null/undefined input', () => {
    expect(parseInlineSegmentsCore('')).toEqual([]);
    expect(parseInlineSegmentsCore(null)).toEqual([]);
    expect(parseInlineSegmentsCore(undefined)).toEqual([]);
  });

  it('returns a single plain text segment for text with no markers', () => {
    expect(parseInlineSegmentsCore('just plain text')).toEqual([{ type: 'text', text: 'just plain text' }]);
  });

  it('parses an inline `code` span', () => {
    expect(parseInlineSegmentsCore('run `npm test` now')).toEqual([
      { type: 'text', text: 'run ' },
      { type: 'code', text: 'npm test' },
      { type: 'text', text: ' now' },
    ]);
  });

  it('parses an inline [section] span', () => {
    expect(parseInlineSegmentsCore('see [Setup] below')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'section', text: 'Setup' },
      { type: 'text', text: ' below' },
    ]);
  });

  it('parses an inline (note) span', () => {
    expect(parseInlineSegmentsCore('do it (carefully) please')).toEqual([
      { type: 'text', text: 'do it ' },
      { type: 'note', text: 'carefully' },
      { type: 'text', text: ' please' },
    ]);
  });

  it('parses a [[wiki link]] span', () => {
    expect(parseInlineSegmentsCore('see [[Related Page]] for more')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'Related Page' },
      { type: 'text', text: ' for more' },
    ]);
  });

  it('does not treat a single unmatched [ as a link opener', () => {
    // src[i+1] !== '[' so this falls through to the plain [section] branch instead.
    expect(parseInlineSegmentsCore('[solo]')).toEqual([{ type: 'section', text: 'solo' }]);
  });

  it('parses a leading !alert token', () => {
    expect(parseInlineSegmentsCore('!warning check this')).toEqual([
      { type: 'alert', text: 'warning' },
      { type: 'text', text: ' check this' },
    ]);
  });

  it('parses a !alert token only when it starts the text or follows whitespace', () => {
    // Not preceded by whitespace ("mid!word") — should NOT be treated as an alert token.
    expect(parseInlineSegmentsCore('mid!word')).toEqual([{ type: 'text', text: 'mid!word' }]);
  });

  it('parses a >quote as the rest of the text, trimmed, and stops there', () => {
    expect(parseInlineSegmentsCore('intro text >   the quoted remainder')).toEqual([
      { type: 'text', text: 'intro text ' },
      { type: 'quote', text: 'the quoted remainder' },
    ]);
  });

  it('treats a leading > as a quote covering the whole rest of the string', () => {
    expect(parseInlineSegmentsCore('>full quote here')).toEqual([{ type: 'quote', text: 'full quote here' }]);
  });

  it('handles multiple different marker types in one string', () => {
    const result = parseInlineSegmentsCore('[Section] has `code` and (a note)');
    expect(result.map((s) => s.type)).toEqual(['section', 'text', 'code', 'text', 'note']);
  });

  it('splits at an unterminated marker character, treating each side as separate plain text (the backtick itself opens a fresh scan that also finds no closing backtick)', () => {
    expect(parseInlineSegmentsCore('unterminated `code span')).toEqual([
      { type: 'text', text: 'unterminated ' },
      { type: 'text', text: '`code span' },
    ]);
  });

  it('filters out any segment with empty text', () => {
    // An empty [] pair produces an empty section text, which the original filters out.
    const result = parseInlineSegmentsCore('before [] after');
    expect(result.every((s) => s.text.length > 0)).toBe(true);
  });
});
