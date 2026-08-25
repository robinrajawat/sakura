import { describe, it, expect } from 'vitest';
import { parseTextToTreeNodesCore, looksAlreadyStructuredCore } from './parseTextToTree';

// Golden cases captured by running legacy's own real parseTextToTreeNodes
// (legacy/index.html:20944) directly in node against representative inputs -- a
// differential test against the real implementation, not just this port's own
// idea of correct behavior.
describe("parseTextToTreeNodesCore (differential against legacy real function)", () => {
  it('flat bullet list with one nested level', () => {
    expect(parseTextToTreeNodesCore("- a\n- b\n  - c\n  - d\n- e")).toEqual([{"text": "a", "depth": 0}, {"text": "b", "depth": 0}, {"text": "c", "depth": 1}, {"text": "d", "depth": 1}, {"text": "e", "depth": 0}]);
  });
  it('numbered + lettered sub-list', () => {
    expect(parseTextToTreeNodesCore("1. First\n2. Second\n   a. Sub A\n   b. Sub B")).toEqual([{"text": "First", "depth": 0}, {"text": "Second", "depth": 0}, {"text": "Sub A", "depth": 1}, {"text": "Sub B", "depth": 1}]);
  });
  it('plain space-indented outline, no markers', () => {
    expect(parseTextToTreeNodesCore("Root\n  Child\n    Grandchild\n  Child2")).toEqual([{"text": "Root", "depth": 0}, {"text": "Child", "depth": 1}, {"text": "Grandchild", "depth": 2}, {"text": "Child2", "depth": 1}]);
  });
  it('tree-connector glyphs (box-drawing characters)', () => {
    expect(parseTextToTreeNodesCore("\u2502  \u251c\u2500\u2500 one\n\u2502  \u2502   \u251c\u2500\u2500 two\n\u2502  \u2514\u2500\u2500 three")).toEqual([{"text": "one", "depth": 0}, {"text": "two", "depth": 1}, {"text": "three", "depth": 0}]);
  });
  it('checkbox markers stripped', () => {
    expect(parseTextToTreeNodesCore("[ ] task one\n[x] task two")).toEqual([{"text": "task one", "depth": 0}, {"text": "task two", "depth": 0}]);
  });
  it('flat unstructured lines (no markers at all)', () => {
    expect(parseTextToTreeNodesCore("Just a flat line\nAnother flat line")).toEqual([{"text": "Just a flat line", "depth": 0}, {"text": "Another flat line", "depth": 0}]);
  });
  it('a leading # is not treated as a heading marker', () => {
    expect(parseTextToTreeNodesCore("# heading style not stripped\n  content")).toEqual([{"text": "# heading style not stripped", "depth": 0}, {"text": "content", "depth": 1}]);
  });
  it('separator lines are skipped, not treated as content', () => {
    expect(parseTextToTreeNodesCore("---\nabove sep\n===\nbelow sep")).toEqual([{"text": "above sep", "depth": 0}, {"text": "below sep", "depth": 0}]);
  });
  it('a bare branch connector marks the next line one level deeper', () => {
    expect(parseTextToTreeNodesCore("\u251c\u2500\u2500\n  wrapped label under branch")).toEqual([{"text": "wrapped label under branch", "depth": 0}]);
  });
  it('wrapped continuation line under a tree-connector list', () => {
    expect(parseTextToTreeNodesCore("- item with trailing text that\n  continues on the next line without a bullet in tree mode\n\u2502 - another")).toEqual([{"text": "item with trailing text that", "depth": 0}, {"text": "continues on the next line without a bullet in tree mode", "depth": 1}, {"text": "another", "depth": 2}]);
  });
  it('empty string', () => {
    expect(parseTextToTreeNodesCore("")).toEqual([]);
  });
  it('whitespace-only input', () => {
    expect(parseTextToTreeNodesCore("   \n\n")).toEqual([]);
  });
  it('roman numeral sub-list', () => {
    expect(parseTextToTreeNodesCore("i. roman one\nii. roman two\n   iii. nested roman")).toEqual([{"text": "roman one", "depth": 0}, {"text": "roman two", "depth": 0}, {"text": "nested roman", "depth": 1}]);
  });
});

describe('looksAlreadyStructuredCore (pure)', () => {
  it('is false for fewer than 2 lines', () => {
    expect(looksAlreadyStructuredCore('one line only')).toBe(false);
    expect(looksAlreadyStructuredCore('')).toBe(false);
  });

  it('is false for a flat bulleted list with uniform indentation (no depth signal)', () => {
    expect(looksAlreadyStructuredCore('- one\n- two\n- three')).toBe(false);
  });

  it('is true when at least two distinct indentation widths are present', () => {
    expect(looksAlreadyStructuredCore('Root\n  Child\n    Grandchild')).toBe(true);
  });

  it('is true when real tree-connector glyphs are present, even with uniform indentation', () => {
    expect(looksAlreadyStructuredCore('├── one\n├── two')).toBe(true);
  });

  it('tabs count toward indentation-width detection (expanded to 2 spaces)', () => {
    expect(looksAlreadyStructuredCore('Root\n\tChild')).toBe(true);
  });

  it('is false for flat unstructured prose with no markers or varying indent', () => {
    expect(looksAlreadyStructuredCore('First sentence.\nSecond sentence.\nThird sentence.')).toBe(false);
  });
});
