import { describe, it, expect } from 'vitest';
import { parseDocxHtmlToTreeNodesCore } from './parseDocxHtml';

describe('parseDocxHtmlToTreeNodesCore', () => {
  it('walks heading levels into a nested depth stack', () => {
    const html = '<h1>Chapter One</h1><h2>Section A</h2><h2>Section B</h2><h1>Chapter Two</h1>';
    const parsed = parseDocxHtmlToTreeNodesCore(html);
    expect(parsed).toEqual([
      { text: 'Chapter One', depth: 0 },
      { text: 'Section A', depth: 1 },
      { text: 'Section B', depth: 1 },
      { text: 'Chapter Two', depth: 0 }
    ]);
  });

  it('a plain wall of paragraphs with no headings comes out flat at depth 0', () => {
    const html = '<p>First</p><p>Second</p><p>Third</p>';
    expect(parseDocxHtmlToTreeNodesCore(html)).toEqual([
      { text: 'First', depth: 0 },
      { text: 'Second', depth: 0 },
      { text: 'Third', depth: 0 }
    ]);
  });

  it('paragraphs under a heading nest one level deeper', () => {
    const html = '<h1>Title</h1><p>Body text</p>';
    expect(parseDocxHtmlToTreeNodesCore(html)).toEqual([
      { text: 'Title', depth: 0 },
      { text: 'Body text', depth: 1 }
    ]);
  });

  it('walks a nested unordered list, stripping leaf bullet markers', () => {
    const html = '<ul><li>- Top item<ul><li>* Nested item</li></ul></li></ul>';
    const parsed = parseDocxHtmlToTreeNodesCore(html);
    expect(parsed).toEqual([
      { text: 'Top item', depth: 0 },
      { text: 'Nested item', depth: 1 }
    ]);
  });

  it('walks an ordered list, stripping numeric/lettered markers', () => {
    const html = '<ol><li>1. First</li><li>2) Second</li></ol>';
    expect(parseDocxHtmlToTreeNodesCore(html)).toEqual([
      { text: 'First', depth: 0 },
      { text: 'Second', depth: 0 }
    ]);
  });

  it('walks a table into one row per first-cell text, extra cells one level deeper', () => {
    const html = '<table><tr><td><p>Row label</p></td><td><p>Extra cell</p></td></tr></table>';
    expect(parseDocxHtmlToTreeNodesCore(html)).toEqual([
      { text: 'Row label', depth: 0 },
      { text: 'Extra cell', depth: 1 }
    ]);
  });

  it('an image-only paragraph becomes a "[image]" placeholder leaf', () => {
    const html = '<p><img src="data:image/png;base64,x"/></p>';
    expect(parseDocxHtmlToTreeNodesCore(html)).toEqual([{ text: '[image]', depth: 0 }]);
  });

  it('returns [] for empty/whitespace-only HTML', () => {
    expect(parseDocxHtmlToTreeNodesCore('')).toEqual([]);
    expect(parseDocxHtmlToTreeNodesCore('<p></p><p>   </p>')).toEqual([]);
  });

  it('a heading level drop returns to the correct ancestor depth (matches a real H1> H3 > H2 document)', () => {
    const html = '<h1>A</h1><h3>B</h3><h2>C</h2>';
    const parsed = parseDocxHtmlToTreeNodesCore(html);
    // H3 nests under H1 (depth 1); H2 pops back past H3 (level 3 > 2) but stays nested under H1
    // (level 2 > 1), landing at the same depth H3 occupied -- matches legacy's own real stack
    // logic exactly (it tracks nesting by relative level comparisons, not absolute H-number).
    expect(parsed).toEqual([
      { text: 'A', depth: 0 },
      { text: 'B', depth: 1 },
      { text: 'C', depth: 1 }
    ]);
  });
});
