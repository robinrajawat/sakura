import { describe, it, expect, beforeAll, vi } from 'vitest';
import { serializeTreeTextWithNotesCore, type NotableNode } from '../../src/utils/serializeTreeTextWithNotes';
import { buildPrefix } from '../../src/core/nodeQueries';
import { computeOutlineNumbers } from '../../src/utils/serializeMarkdown';
import { getNodePlainText } from '../../src/utils/stripSemanticMarkers';

// serializeTreeTextWithNotes.ts references buildPrefix/computeOutlineNumbers/getNodePlainText
// as ambient globals (declare function, erased at compile time — see the module's own header
// for why). In the real app those globals are provided by their own already-spliced generated
// blocks sharing the same script scope; in this Node test environment there is no such shared
// scope, so they're wired up explicitly here from the real implementations — not mocks, the
// actual tested code. stripHtmlToText, by contrast, is a genuine injected DEPENDENCY parameter
// (see the module's own header for why) — passed explicitly per call, not wired ambiently.
beforeAll(() => {
  const g = globalThis as unknown as {
    buildPrefix: typeof buildPrefix;
    computeOutlineNumbers: typeof computeOutlineNumbers;
    getNodePlainText: typeof getNodePlainText;
  };
  g.buildPrefix = buildPrefix;
  g.computeOutlineNumbers = computeOutlineNumbers;
  g.getNodePlainText = getNodePlainText;
});

// A simple, deterministic stand-in for the real DOM-touching stripHtmlToText — not testing
// stripHtmlToText itself here (that has its own coverage elsewhere via its real callers), only
// that serializeTreeTextWithNotesCore calls whatever function it's given, with the right
// argument, at the right point.
const fakeStripHtmlToText = (html: string) => html.replace(/<[^>]+>/g, '').trim();

function node(depth: number, text: string, note?: string): NotableNode {
  return { id: depth * 1000 + text.length, depth, text, note };
}

describe('serializeTreeTextWithNotesCore', () => {
  it('returns empty string for an empty node list', () => {
    expect(serializeTreeTextWithNotesCore([], false, false, 4, false, fakeStripHtmlToText)).toBe('');
  });

  it('renders a node with no note as a single line, same as serializeTreeText', () => {
    const result = serializeTreeTextWithNotesCore([node(0, 'Root')], false, false, 4, false, fakeStripHtmlToText);
    expect(result).toBe('Root');
  });

  it('appends a "Note:" line directly under a node with a note', () => {
    const result = serializeTreeTextWithNotesCore(
      [node(0, 'Root', '<p>an important note</p>')],
      false,
      false,
      4,
      false,
      fakeStripHtmlToText
    );
    const lines = result.split('\n');
    expect(lines[0]).toBe('Root');
    expect(lines[1]).toContain('Note: an important note');
  });

  it('omits the Note: line when the node has no note', () => {
    const result = serializeTreeTextWithNotesCore([node(0, 'Root')], false, false, 4, false, fakeStripHtmlToText);
    expect(result).not.toContain('Note:');
  });

  it('omits the Note: line when stripHtmlToText returns an empty string for the note', () => {
    const result = serializeTreeTextWithNotesCore(
      [node(0, 'Root', '<p></p>')],
      false,
      false,
      4,
      false,
      () => ''
    );
    expect(result).not.toContain('Note:');
  });

  it('calls the injected stripHtmlToText with exactly the raw note HTML', () => {
    const spy = vi.fn((html: string) => html.toUpperCase());
    serializeTreeTextWithNotesCore([node(0, 'Root', '<b>raw</b>')], false, false, 4, false, spy);
    expect(spy).toHaveBeenCalledWith('<b>raw</b>');
  });

  it('does not call stripHtmlToText at all for a node without a note', () => {
    const spy = vi.fn((html: string) => html);
    serializeTreeTextWithNotesCore([node(0, 'Root')], false, false, 4, false, spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('indents the Note: line to match its node\'s own tree-connector prefix', () => {
    const tree = [node(0, 'Root'), node(1, 'Child', '<p>child note</p>')];
    const result = serializeTreeTextWithNotesCore(tree, false, false, 4, false, fakeStripHtmlToText);
    const lines = result.split('\n');
    // The note line should carry the same leading whitespace/connector column as its node line,
    // plus the literal "    Note: " marker after it.
    expect(lines[2]).toMatch(/Note: child note$/);
    expect(lines[2].length).toBeGreaterThan('    Note: child note'.length);
  });

  it('prepends dotted outline numbers when outlineNumbering is true', () => {
    const result = serializeTreeTextWithNotesCore([node(0, 'Root')], false, true, 4, false, fakeStripHtmlToText);
    expect(result).toContain('1 Root');
  });

  it('rebases depth to 0 for the shallowest node when rebaseDepth is true', () => {
    const subtree = [node(2, 'Parent'), node(3, 'Child')];
    const result = serializeTreeTextWithNotesCore(subtree, true, false, 4, false, fakeStripHtmlToText);
    expect(result.split('\n')[0]).toBe('Parent');
  });

  it('strips the vertical continuation column when hideTreeLines is true', () => {
    const tree = [node(0, 'Root'), node(1, 'A'), node(2, 'A1'), node(1, 'B')];
    const shown = serializeTreeTextWithNotesCore(tree, false, false, 4, false, fakeStripHtmlToText);
    const hidden = serializeTreeTextWithNotesCore(tree, false, false, 4, true, fakeStripHtmlToText);
    expect(shown).toContain('│');
    expect(hidden).not.toContain('│');
  });

  it('renders multiple nodes with mixed notes/no-notes correctly', () => {
    const tree = [node(0, 'A', '<p>note A</p>'), node(0, 'B'), node(0, 'C', '<p>note C</p>')];
    const result = serializeTreeTextWithNotesCore(tree, false, false, 4, false, fakeStripHtmlToText);
    const lines = result.split('\n');
    expect(lines).toEqual(['A', expect.stringContaining('Note: note A'), 'B', 'C', expect.stringContaining('Note: note C')]);
  });
});
