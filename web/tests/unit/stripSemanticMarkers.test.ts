import { describe, it, expect } from 'vitest';
import { stripSemanticMarkers, getNodePlainText } from '../../src/utils/stripSemanticMarkers';

// Pinned local oracle — literal copy of index.html's current stripSemanticMarkers().
function originalStripSemanticMarkers(text: string | null | undefined): string {
  return String(text || '')
    .replace(/\[\[([\s\S]*?)\]\](?!\])/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)!(\S)/g, '$1$2')
    .replace(/^>\s*/, '')
    .replace(/(\s)>(\S)/g, '$1$2');
}

describe('stripSemanticMarkers', () => {
  it('unwraps a wikilink', () => {
    expect(stripSemanticMarkers('see [[Other Doc]] for details')).toBe('see Other Doc for details');
  });

  it('unwraps a section header bracket', () => {
    expect(stripSemanticMarkers('[Overview]')).toBe('Overview');
  });

  it('unwraps a parenthetical', () => {
    expect(stripSemanticMarkers('some text (an aside) more text')).toBe('some text an aside more text');
  });

  it('unwraps inline code backticks', () => {
    expect(stripSemanticMarkers('run `npm install` first')).toBe('run npm install first');
  });

  it('strips a leading highlight marker', () => {
    expect(stripSemanticMarkers('!Important note')).toBe('Important note');
  });

  it('strips a leading quote marker', () => {
    expect(stripSemanticMarkers('> quoted text')).toBe('quoted text');
  });

  it('handles empty/null/undefined input', () => {
    expect(stripSemanticMarkers('')).toBe('');
    expect(stripSemanticMarkers(null)).toBe('');
    expect(stripSemanticMarkers(undefined)).toBe('');
  });

  it('leaves plain text with no markers unchanged', () => {
    expect(stripSemanticMarkers('just plain text')).toBe('just plain text');
  });

  it('handles combined markers in one string', () => {
    expect(stripSemanticMarkers('[[Link]] and (aside) and `code`')).toBe('Link and aside and code');
  });

  it('matches the pinned original across a spread of inputs', () => {
    const cases = [
      '[[wikilink]]',
      '[section]',
      '(aside)',
      '`code`',
      '!highlighted',
      '> quoted',
      'mixed [[a]] (b) `c` !d text > e',
      '',
      'no markers here at all',
      '[[nested [brackets] inside]]',
    ];
    for (const c of cases) {
      expect(stripSemanticMarkers(c)).toBe(originalStripSemanticMarkers(c));
    }
  });
});

describe('getNodePlainText', () => {
  it('returns a node\'s text field', () => {
    expect(getNodePlainText({ text: 'Linked item' })).toBe('Linked item');
  });

  it('handles a node with no text field', () => {
    expect(getNodePlainText({})).toBe('');
  });

  it('handles a node with null text', () => {
    expect(getNodePlainText({ text: null })).toBe('');
  });
  // Rows are rich text (2026-10-22): formatting lives in node.marks, typed ** __ [ ] are plain
  // characters, and so are [[ ]] (row links are marks too, since rowFormat 4).
  it('keeps every typed character', () => {
    expect(getNodePlainText({ text: 'See [[Route Determination]] for **this** and [that] (aside)' }))
      .toBe('See [[Route Determination]] for **this** and [that] (aside)');
  });
});
