import { describe, it, expect, beforeAll } from 'vitest';
import { serializeTreeTextCore } from './serializeTreeText';
import { buildPrefix } from '../core/nodeQueries';
import { computeOutlineNumbers } from './serializeMarkdown';
import { getNodePlainText } from './stripSemanticMarkers';
import type { QueryableNode } from '../core/nodeQueries';

// serializeTreeText.ts references buildPrefix/computeOutlineNumbers/getNodePlainText as ambient
// globals (declare function, erased at compile time — see the module's own header for why). In
// the real app those globals are provided by their own already-spliced generated blocks sharing
// the same script scope; in this Node test environment there is no such shared scope, so they're
// wired up explicitly here from the real implementations — not mocks, the actual tested code.
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

function node(depth: number, text: string): QueryableNode {
  return { id: depth * 1000 + text.length, depth, text };
}

describe('serializeTreeTextCore', () => {
  it('returns empty string for an empty node list', () => {
    expect(serializeTreeTextCore([], false, false, 4, false)).toBe('');
  });

  it('renders a single root node with no connectors', () => {
    const result = serializeTreeTextCore([node(0, 'Root')], false, false, 4, false);
    expect(result).toBe('Root');
  });

  it('renders parent/child connectors for a simple two-level tree', () => {
    const tree = [node(0, 'Root'), node(1, 'Child A'), node(1, 'Child B')];
    const result = serializeTreeTextCore(tree, false, false, 4, false);
    const lines = result.split('\n');
    expect(lines[0]).toBe('Root');
    expect(lines[1]).toContain('Child A');
    expect(lines[2]).toContain('Child B');
    // last sibling gets the closing connector, not-last gets the continuing one
    expect(lines[1]).toContain('├──');
    expect(lines[2]).toContain('└──');
  });

  it('strips semantic markers from node text via getNodePlainText', () => {
    const result = serializeTreeTextCore([node(0, '[Section] title')], false, false, 4, false);
    expect(result).toBe('Section title');
  });

  it('prepends dotted outline numbers when outlineNumbering is true', () => {
    const tree = [node(0, 'Root'), node(1, 'Child')];
    const result = serializeTreeTextCore(tree, false, true, 4, false);
    expect(result).toContain('1 Root');
    expect(result).toContain('1.1 Child');
  });

  it('omits outline numbers when outlineNumbering is false', () => {
    const result = serializeTreeTextCore([node(0, 'Root')], false, false, 4, false);
    expect(result).not.toMatch(/^\d/);
  });

  it('rebases depth to 0 for the shallowest node when rebaseDepth is true', () => {
    const subtree = [node(2, 'Parent'), node(3, 'Child')];
    const rebased = serializeTreeTextCore(subtree, true, false, 4, false);
    const notRebased = serializeTreeTextCore(subtree, false, false, 4, false);
    // rebased: parent renders at depth 0 (no indent/connector on line 1)
    expect(rebased.split('\n')[0]).toBe('Parent');
    // not rebased: parent still renders indented, since depth 2 > 0
    expect(notRebased.split('\n')[0]).not.toBe('Parent');
  });

  it('strips the vertical continuation column when hideTreeLines is true', () => {
    const tree = [node(0, 'Root'), node(1, 'A'), node(2, 'A1'), node(1, 'B')];
    const shown = serializeTreeTextCore(tree, false, false, 4, false);
    const hidden = serializeTreeTextCore(tree, false, false, 4, true);
    expect(shown).toContain('│');
    expect(hidden).not.toContain('│');
    // hideTreeLines also drops the connector glyphs entirely (├/└), not just the vertical bars
    expect(hidden).not.toMatch(/[├└]/);
  });

  it('respects a custom treeIndentWidth', () => {
    const tree = [node(0, 'Root'), node(1, 'Child')];
    const narrow = serializeTreeTextCore(tree, false, false, 2, false);
    const wide = serializeTreeTextCore(tree, false, false, 8, false);
    expect(wide.split('\n')[1].length).toBeGreaterThan(narrow.split('\n')[1].length);
  });

  it('trims trailing whitespace from each rendered line', () => {
    const result = serializeTreeTextCore([node(0, '')], false, false, 4, false);
    expect(result).toBe(result.trimEnd());
  });
});
