import { describe, expect, it } from 'vitest';
import { parseSemanticMarkup } from './parseSemanticMarkup';

describe('parseSemanticMarkup', () => {
  it('returns a single text segment for plain text with no markers', () => {
    expect(parseSemanticMarkup('just plain text')).toEqual([{ type: 'text', text: 'just plain text' }]);
  });

  it('returns an empty array for empty/null/undefined input', () => {
    expect(parseSemanticMarkup('')).toEqual([]);
    expect(parseSemanticMarkup(null)).toEqual([]);
    expect(parseSemanticMarkup(undefined)).toEqual([]);
  });

  it('parses `code` as a code segment, delimiters excluded from the segment text', () => {
    expect(parseSemanticMarkup('run `npm test` now')).toEqual([
      { type: 'text', text: 'run ' },
      { type: 'code', text: 'npm test' },
      { type: 'text', text: ' now' }
    ]);
  });

  it('parses [Section] as a section segment', () => {
    expect(parseSemanticMarkup('see [Introduction] for details')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'section', text: 'Introduction' },
      { type: 'text', text: ' for details' }
    ]);
  });

  it('parses (note) as a note segment', () => {
    expect(parseSemanticMarkup('done (pending review)')).toEqual([
      { type: 'text', text: 'done ' },
      { type: 'note', text: 'pending review' }
    ]);
  });

  it('parses !alert only at the start of text or after whitespace, capturing up to the next whitespace', () => {
    expect(parseSemanticMarkup('!urgent fix this')).toEqual([
      { type: 'alert', text: 'urgent' },
      { type: 'text', text: ' fix this' }
    ]);
    expect(parseSemanticMarkup('please !urgent fix')).toEqual([
      { type: 'text', text: 'please ' },
      { type: 'alert', text: 'urgent' },
      { type: 'text', text: ' fix' }
    ]);
  });

  it('does NOT treat a mid-word "!" as an alert marker (no preceding whitespace/start)', () => {
    expect(parseSemanticMarkup('wow!urgent')).toEqual([{ type: 'text', text: 'wow!urgent' }]);
  });

  it('parses [[wiki link]] as a link segment, delimiters excluded and display text stripped of markers', () => {
    expect(parseSemanticMarkup('see [[Some Page]] for more')).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'Some Page', target: 'Some Page' },
      { type: 'text', text: ' for more' }
    ]);
  });

  it('does not misread [[[triple]]] brackets as a valid link (matches getBacklinkRefs)', () => {
    expect(parseSemanticMarkup('[[[triple]]]')).toEqual([{ type: 'link', text: 'triple', target: '[triple]' }]);
  });

  it('strips a semantic marker from a wikilink target for display, keeping the raw text as target', () => {
    expect(parseSemanticMarkup('[[[Section] Name]]')).toEqual([
      { type: 'link', text: 'Section Name', target: '[Section] Name' }
    ]);
  });

  it('leaves an empty [[]] as plain text (matches legacy: end > i+2 excludes an empty target)', () => {
    expect(parseSemanticMarkup('[[]]')).toEqual([{ type: 'text', text: '[[]]' }]);
  });

  it('handles multiple markers of different types in one string, in document order', () => {
    expect(parseSemanticMarkup('[Section] some `code` here (a note) !alert end')).toEqual([
      { type: 'section', text: 'Section' },
      { type: 'text', text: ' some ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' here ' },
      { type: 'note', text: 'a note' },
      { type: 'text', text: ' ' },
      { type: 'alert', text: 'alert' },
      { type: 'text', text: ' end' }
    ]);
  });

  it('treats an unclosed marker (no matching closing delimiter) as plain text, not a broken segment', () => {
    expect(parseSemanticMarkup('unclosed `code here')).toEqual([{ type: 'text', text: 'unclosed `code here' }]);
    expect(parseSemanticMarkup('unclosed [section here')).toEqual([{ type: 'text', text: 'unclosed [section here' }]);
    expect(parseSemanticMarkup('unclosed (note here')).toEqual([{ type: 'text', text: 'unclosed (note here' }]);
  });

  it('an empty marker body (adjacent delimiters) is treated as plain text, matching the ">i+1" length check', () => {
    expect(parseSemanticMarkup('nothing `` here')).toEqual([{ type: 'text', text: 'nothing `` here' }]);
    expect(parseSemanticMarkup('nothing [] here')).toEqual([{ type: 'text', text: 'nothing [] here' }]);
    expect(parseSemanticMarkup('nothing () here')).toEqual([{ type: 'text', text: 'nothing () here' }]);
  });
});
