import { describe, it, expect } from 'vitest';
import { buildTocEntries, type TocSourceNode } from './previewToc';

function node(id: number, text: string, heading = 0): TocSourceNode {
  return { id, text, styles: { heading } };
}

describe('buildTocEntries', () => {
  it('produces a level-1 section entry for [Section] markup, stripping the brackets', () => {
    const entries = buildTocEntries([node(1, '[Getting Started]')]);
    expect(entries).toEqual([{ id: 1, text: 'Getting Started', level: 1, kind: 'section' }]);
  });

  it('produces a heading entry at the node\'s own heading level', () => {
    const entries = buildTocEntries([node(1, 'Overview', 2)]);
    expect(entries).toEqual([{ id: 1, text: 'Overview', level: 2, kind: 'heading' }]);
  });

  it('a plain node with no section markup and no heading level contributes nothing', () => {
    expect(buildTocEntries([node(1, 'Just a regular node')])).toEqual([]);
  });

  it('strips semantic markers from heading labels', () => {
    const entries = buildTocEntries([node(1, '(a note) with markup', 1)]);
    expect(entries[0].text).not.toContain('(');
  });

  it('falls back to "Untitled" for a heading whose text is empty after stripping', () => {
    const entries = buildTocEntries([node(1, '', 3)]);
    expect(entries[0].text).toBe('Untitled');
  });

  it('falls back to the bracketless text for a section whose text is empty after stripping semantic markers', () => {
    const entries = buildTocEntries([node(1, '[X]')]);
    expect(entries[0].text).toBe('X');
  });

  it('preserves document order and mixes sections/headings/plain nodes correctly', () => {
    const entries = buildTocEntries([
      node(1, '[Intro]'),
      node(2, 'plain node'),
      node(3, 'Chapter One', 1),
      node(4, 'Sub-point', 2)
    ]);
    expect(entries.map((e) => e.id)).toEqual([1, 3, 4]);
    expect(entries.map((e) => e.kind)).toEqual(['section', 'heading', 'heading']);
  });

  it('section markup takes priority over an also-set heading level (matches legacy\'s if/else-if)', () => {
    const entries = buildTocEntries([node(1, '[Both]', 3)]);
    expect(entries).toEqual([{ id: 1, text: 'Both', level: 1, kind: 'section' }]);
  });

  it('returns [] for an empty node list', () => {
    expect(buildTocEntries([])).toEqual([]);
  });
});
